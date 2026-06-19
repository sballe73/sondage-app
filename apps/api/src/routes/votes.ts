import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { validateGrades } from "@sondage/shared";
import type { VoteSubmittedEvent } from "@sondage/shared";
import { enforcePollRegion } from "../middleware/region.js";
import { requireVoterAuth } from "./auth.js";
import { verifyGroupMembership } from "../auth/oauth.js";
import { tryClaimVote, releaseVoteClaim, checkVoteRateLimit } from "../redis.js";
import { publishVoteEvent } from "../events.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";

const voteBodySchema = z.object({
  grades: z.array(
    z.object({
      itemId: z.string().uuid(),
      grade: z.number().int(),
    })
  ),
});

export async function voteRoutes(app: FastifyInstance) {
  app.post("/polls/:pollId/votes", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const { poll, items } = await enforcePollRegion(request, pollId);

    const now = new Date();
    if (now < poll.startsAt) {
      throw new AppError(403, "POLL_NOT_STARTED", "Poll has not started yet", {
        startsAt: poll.startsAt,
      });
    }
    if (now >= poll.endsAt || poll.closedAt) {
      throw new AppError(403, "POLL_CLOSED", "Poll is closed", {
        endsAt: poll.endsAt,
        closedAt: poll.closedAt ?? undefined,
      });
    }

    const auth = await requireVoterAuth(pollId, request.headers.authorization);

    const rateLimit = await checkVoteRateLimit(
      pollId,
      auth.token.platform,
      auth.token.subjectId,
      config.rateLimitVotesPerMinute
    );
    if (!rateLimit.allowed) {
      request.log.warn(
        {
          pollId,
          platform: auth.token.platform,
          subjectId: auth.token.subjectId,
          event: "vote_rate_limited",
          count: rateLimit.count,
          retryAfterSec: rateLimit.retryAfterSec,
        },
        "Vote rate limit exceeded"
      );
      throw new AppError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "Too many vote attempts",
        {
          limit: config.rateLimitVotesPerMinute,
          retryAfterSec: rateLimit.retryAfterSec,
        },
        { "Retry-After": String(rateLimit.retryAfterSec) }
      );
    }

    if (poll.visibility === "group" && poll.groupId) {
      const member = await verifyGroupMembership(
        auth.token.platform,
        poll.groupId,
        auth.token.subjectId
      );
      if (!member) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Not a member of required group",
          { groupId: poll.groupId }
        );
      }
    }

    const body = voteBodySchema.parse(request.body);
    const itemIds = new Set(items.map((i) => i.id));
    try {
      validateGrades(body.grades, itemIds, poll.gradeMin, poll.gradeMax);
    } catch (e) {
      throw new AppError(400, "INVALID_GRADES", (e as Error).message);
    }

    const idempotencyKey =
      (request.headers["idempotency-key"] as string | undefined) ??
      undefined;

    const claim = await tryClaimVote(
      pollId,
      auth.token.platform,
      auth.token.subjectId,
      poll.endsAt,
      idempotencyKey
    );

    const voteLogBase = {
      pollId,
      platform: auth.token.platform,
      ...(config.logPii ? { subjectId: auth.token.subjectId } : {}),
    };

    if (claim === "already_voted") {
      request.log.warn(
        { ...voteLogBase, event: "vote_rejected", reason: "already_voted" },
        "Double vote rejected"
      );
      throw new AppError(409, "ALREADY_VOTED", "Already voted");
    }
    if (claim === "idempotent_replay") {
      request.log.warn(
        {
          ...voteLogBase,
          event: "vote_idempotent_replay",
          idempotencyKey,
        },
        "Vote idempotency replay"
      );
      return reply.status(202).send({ status: "accepted", replay: true });
    }

    const event: VoteSubmittedEvent = {
      eventId: randomUUID(),
      pollId,
      platform: auth.token.platform,
      subjectId: auth.token.subjectId,
      displayName: auth.token.displayName,
      grades: body.grades,
      voterMode: poll.voterMode as "anonymous" | "public",
      submittedAt: new Date().toISOString(),
      idempotencyKey,
    };

    try {
      await publishVoteEvent(event);
    } catch (e) {
      await releaseVoteClaim(
        pollId,
        auth.token.platform,
        auth.token.subjectId
      );
      throw e;
    }

    request.log.info(
      {
        ...voteLogBase,
        event: "vote_accepted",
        eventId: event.eventId,
        idempotencyKey,
      },
      "Vote accepted"
    );

    return reply.status(202).send({
      status: "accepted",
      eventId: event.eventId,
      message:
        poll.voterMode === "anonymous"
          ? "Vote recorded; individual ballot will not be retained"
          : "Vote recorded; ballot visible per poll policy",
    });
  });
}
