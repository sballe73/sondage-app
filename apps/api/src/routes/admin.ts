import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getPollById,
  closePoll,
  updatePollDates,
  getVoteCount,
  computeAndSaveSnapshot,
} from "@sondage/db";
import {
  isResultsVisible,
  PollDateUpdateError,
  validatePollDateUpdate,
} from "@sondage/shared";
import type { Platform, ResultPolicy } from "@sondage/shared";
import { enforcePollRegion } from "../middleware/region.js";
import { AppError } from "../errors.js";
import { requirePollCreatorAuth } from "./auth.js";
import { getLiveVoteCount } from "../redis.js";

const dateFieldSchema = z.union([z.literal("now"), z.string().datetime()]);

function resolveDateField(value: string | "now"): Date {
  if (value === "now") return new Date();
  return new Date(value);
}

export async function adminRoutes(app: FastifyInstance) {
  app.patch("/polls/:pollId/dates", async (request, reply) => {
    const { pollId } = z
      .object({ pollId: z.string().uuid() })
      .parse(request.params);
    const body = z
      .object({
        startsAt: dateFieldSchema.optional(),
        endsAt: dateFieldSchema.optional(),
      })
      .parse(request.body ?? {});

    await enforcePollRegion(request, pollId);
    const { poll } = await requirePollCreatorAuth(
      pollId,
      request.headers.authorization
    );

    const update: { startsAt?: Date; endsAt?: Date } = {};
    if (body.startsAt !== undefined) {
      update.startsAt = resolveDateField(body.startsAt);
    }
    if (body.endsAt !== undefined) {
      update.endsAt = resolveDateField(body.endsAt);
    }

    let nextDates;
    try {
      nextDates = validatePollDateUpdate(
        {
          startsAt: poll.startsAt,
          endsAt: poll.endsAt,
          closedAt: poll.closedAt,
        },
        update
      );
    } catch (e) {
      if (e instanceof PollDateUpdateError) {
        throw new AppError(400, e.code, e.message);
      }
      if ((e as Error).message === "endsAt must be after startsAt") {
        throw new AppError(400, "INVALID_POLL_WINDOW", (e as Error).message);
      }
      throw e;
    }

    const updated = await updatePollDates(pollId, nextDates);
    const data = await getPollById(pollId);
    const dbCount = await getVoteCount(pollId);
    const voteCount = await getLiveVoteCount(pollId, dbCount);

    return {
      ...updated,
      items: data?.items ?? [],
      voteCount,
    };
  });

  app.post("/polls/:pollId/close", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ creatorId: z.string() })
      .parse(request.body ?? {});

    const { poll } = await enforcePollRegion(request, pollId);

    if (poll.creatorId !== body.creatorId) {
      throw new AppError(403, "FORBIDDEN", "Not poll creator");
    }

    await closePoll(pollId);
    const voteCount = await getVoteCount(pollId);
    const visible = isResultsVisible(
      poll.resultPolicy as ResultPolicy,
      voteCount,
      new Date(0),
      new Date(),
      {
        platform: poll.platform as Platform,
        mockSnapshotEveryVote: poll.mockSnapshotEveryVote,
      }
    );
    const snapshot = await computeAndSaveSnapshot(pollId, 1, visible || true);
    return { closed: true, snapshot };
  });
}
