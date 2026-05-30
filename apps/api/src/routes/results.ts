import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ResultPolicy } from "@sondage/shared";
import {
  getLatestVisibleSnapshot,
  getSnapshotByVersion,
  getVoteCount,
  getNextSnapshotVersion,
  listBallots,
  getBallotBySubject,
  computeAndSaveSnapshot,
} from "@sondage/db";
import { enforcePollRegion } from "../middleware/region.js";
import {
  isResultsVisible,
  shouldPublishSnapshot,
} from "../services/results-policy.js";
import { getVoteCountRedis, syncVoteCountFromDb } from "../redis.js";
import { requireVoterAuth } from "./auth.js";
import { AppError } from "../errors.js";

const CACHE_MAX_AGE_VISIBLE = 60;
const CACHE_MAX_AGE_HIDDEN = 15;

export async function resultsRoutes(app: FastifyInstance) {
  app.get("/polls/:pollId/results", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const { poll } = await enforcePollRegion(request, pollId);

    const dbCount = await getVoteCount(pollId);
    await syncVoteCountFromDb(pollId, dbCount);
    const voteCount = Math.max(dbCount, await getVoteCountRedis(pollId));

    const policy = poll.resultPolicy as ResultPolicy;
    const visible = isResultsVisible(policy, voteCount, poll.endsAt);

    if (!visible) {
      reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
      throw new AppError(
        403,
        "RESULTS_NOT_VISIBLE",
        "Results not yet available",
        { policy, voteCount, endsAt: poll.endsAt }
      );
    }

    let snapshot = await getLatestVisibleSnapshot(pollId);
    const snapshotVoteCount = snapshot?.voteCount ?? 0;
    const now = new Date();
    const pollEnded = now >= poll.endsAt;
    const needsSnapshot =
      !snapshot ||
      shouldPublishSnapshot(policy, snapshotVoteCount, voteCount, poll.endsAt) ||
      (pollEnded && snapshotVoteCount < voteCount);

    if (needsSnapshot) {
      const version = await getNextSnapshotVersion(pollId);
      await computeAndSaveSnapshot(pollId, version, true);
      snapshot = await getLatestVisibleSnapshot(pollId);
      if (!snapshot) {
        reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
        throw new AppError(
          404,
          "SNAPSHOT_NOT_FOUND",
          "No published snapshot yet",
          { voteCount }
        );
      }
    }

    reply.header(
      "Cache-Control",
      `public, max-age=${CACHE_MAX_AGE_VISIBLE}, stale-while-revalidate=30`
    );
    reply.header("X-Results-Version", String(snapshot.version));
    return {
      version: snapshot.version,
      voteCount: snapshot.voteCount,
      liveVoteCount: voteCount,
      computedAt: snapshot.computedAt,
      results: snapshot.payload,
    };
  });

  app.get("/polls/:pollId/results/versions/:version", async (request, reply) => {
    const params = z
      .object({
        pollId: z.string().uuid(),
        version: z.coerce.number().int().positive(),
      })
      .parse(request.params);
    await enforcePollRegion(request, params.pollId);

    const snapshot = await getSnapshotByVersion(params.pollId, params.version);
    if (!snapshot || !snapshot.visible) {
      throw new AppError(404, "NOT_FOUND", "Snapshot not found");
    }
    reply.header("Cache-Control", "public, max-age=3600, immutable");
    return {
      version: snapshot.version,
      voteCount: snapshot.voteCount,
      computedAt: snapshot.computedAt,
      results: snapshot.payload,
    };
  });

  app.get("/polls/:pollId/ballots", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const { poll } = await enforcePollRegion(request, pollId);

    if (poll.voterMode !== "public") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Ballots are not available for anonymous polls"
      );
    }

    const ballots = await listBallots(pollId);
    return { ballots };
  });

  app.get("/polls/:pollId/ballots/:subjectId", async (request, reply) => {
    const params = z
      .object({ pollId: z.string().uuid(), subjectId: z.string() })
      .parse(request.params);
    const { poll } = await enforcePollRegion(request, params.pollId);

    if (poll.voterMode !== "public") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Individual ballots are not retained for anonymous polls"
      );
    }

    const ballot = await getBallotBySubject(params.pollId, params.subjectId);
    if (!ballot) {
      throw new AppError(404, "NOT_FOUND", "Ballot not found");
    }
    return ballot;
  });

  app.get("/polls/:pollId/participation", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const regionData = await enforcePollRegion(request, pollId);
    const auth = await requireVoterAuth(pollId, request.headers.authorization);
    const { getBallotBySubject: getBallot } = await import("@sondage/db");
    if (regionData.poll.voterMode === "public") {
      const ballot = await getBallot(pollId, auth.token.subjectId);
      return { voted: !!ballot, ballot: ballot ?? undefined };
    }
    const { schema, getDb } = await import("@sondage/db");
    const { eq, and } = await import("drizzle-orm");
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.voteParticipation)
      .where(
        and(
          eq(schema.voteParticipation.pollId, pollId),
          eq(schema.voteParticipation.subjectId, auth.token.subjectId)
        )
      );
    return { voted: !!row };
  });
}
