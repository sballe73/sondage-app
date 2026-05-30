import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPollById, closePoll } from "@sondage/db";
import { computeAndSaveSnapshot } from "@sondage/db";
import { isResultsVisible } from "@sondage/shared";
import type { ResultPolicy } from "@sondage/shared";
import { getVoteCount } from "@sondage/db";
import { enforcePollRegion } from "../middleware/region.js";
import { AppError } from "../errors.js";

export async function adminRoutes(app: FastifyInstance) {
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
      new Date(0)
    );
    const snapshot = await computeAndSaveSnapshot(pollId, 1, visible || true);
    return { closed: true, snapshot };
  });
}
