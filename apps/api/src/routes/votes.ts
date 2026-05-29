import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { validateGrades } from "@sondage/shared";
import type { VoteSubmittedEvent } from "@sondage/shared";
import { enforcePollRegion } from "../middleware/region.js";
import { requireVoterAuth } from "./auth.js";
import { verifyGroupMembership } from "../auth/oauth.js";
import { tryClaimVote, releaseVoteClaim } from "../redis.js";
import { publishVoteEvent } from "../events.js";

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
    const regionResult = await enforcePollRegion(request, reply, pollId);
    if (!regionResult || "statusCode" in regionResult) return;

    const { poll, items } = regionResult;
    const now = new Date();
    if (now < poll.startsAt) {
      return reply.status(403).send({ error: "Poll has not started yet" });
    }
    if (now >= poll.endsAt || poll.closedAt) {
      return reply.status(403).send({ error: "Poll is closed" });
    }

    let auth;
    try {
      auth = await requireVoterAuth(pollId, request.headers.authorization);
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      return reply
        .status(err.statusCode ?? 500)
        .send({ error: err.message });
    }

    if (poll.visibility === "group" && poll.groupId) {
      const member = await verifyGroupMembership(
        auth.token.platform,
        poll.groupId,
        auth.token.subjectId
      );
      if (!member) {
        return reply.status(403).send({ error: "Not a member of required group" });
      }
    }

    const body = voteBodySchema.parse(request.body);
    const itemIds = new Set(items.map((i) => i.id));
    try {
      validateGrades(body.grades, itemIds, poll.gradeMin, poll.gradeMax);
    } catch (e) {
      return reply.status(400).send({ error: (e as Error).message });
    }

    const idempotencyKey =
      (request.headers["idempotency-key"] as string | undefined) ??
      undefined;

    const claim = await tryClaimVote(
      pollId,
      auth.token.subjectId,
      poll.endsAt,
      idempotencyKey
    );

    if (claim === "already_voted") {
      return reply.status(409).send({ error: "Already voted" });
    }
    if (claim === "idempotent_replay") {
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
      await releaseVoteClaim(pollId, auth.token.subjectId);
      throw e;
    }

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
