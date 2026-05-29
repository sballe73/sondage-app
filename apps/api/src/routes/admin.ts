import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPollById, closePoll } from "@sondage/db";
import { computeAndSaveSnapshot } from "@sondage/db";
import { isResultsVisible } from "@sondage/shared";
import type { ResultPolicy } from "@sondage/shared";
import { getVoteCount } from "@sondage/db";
import { enforcePollRegion } from "../middleware/region.js";

export async function adminRoutes(app: FastifyInstance) {
  app.post("/polls/:pollId/close", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ creatorId: z.string() })
      .parse(request.body ?? {});

    const regionResult = await enforcePollRegion(request, reply, pollId);
    if (!regionResult || "statusCode" in regionResult) return;
    const { poll } = regionResult;

    if (poll.creatorId !== body.creatorId) {
      return reply.status(403).send({ error: "Not poll creator" });
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
