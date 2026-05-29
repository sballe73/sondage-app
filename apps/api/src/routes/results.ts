import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ResultPolicy } from "@sondage/shared";
import {
  getLatestVisibleSnapshot,
  getSnapshotByVersion,
  getVoteCount,
  listBallots,
  getBallotBySubject,
  computeAndSaveSnapshot,
} from "@sondage/db";
import { enforcePollRegion } from "../middleware/region.js";
import { isResultsVisible } from "../services/results-policy.js";
import { getVoteCountRedis, syncVoteCountFromDb } from "../redis.js";
import { requireVoterAuth } from "./auth.js";

const CACHE_MAX_AGE_VISIBLE = 60;
const CACHE_MAX_AGE_HIDDEN = 15;

export async function resultsRoutes(app: FastifyInstance) {
  app.get("/polls/:pollId/results", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const regionResult = await enforcePollRegion(request, reply, pollId);
    if (!regionResult || "statusCode" in regionResult) return;
    const { poll } = regionResult;

    const dbCount = await getVoteCount(pollId);
    await syncVoteCountFromDb(pollId, dbCount);
    const voteCount = Math.max(dbCount, await getVoteCountRedis(pollId));

    const policy = poll.resultPolicy as ResultPolicy;
    const visible = isResultsVisible(policy, voteCount, poll.endsAt);

    if (!visible) {
      reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
      return reply.status(403).send({
        error: "Results not yet available",
        policy,
        voteCount,
        endsAt: poll.endsAt,
      });
    }

    let snapshot = await getLatestVisibleSnapshot(pollId);
    if (!snapshot) {
      await computeAndSaveSnapshot(pollId, voteCount, true);
      snapshot = await getLatestVisibleSnapshot(pollId);
      if (!snapshot) {
        reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
        return reply.status(404).send({
          error: "No published snapshot yet",
          voteCount,
        });
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
    const regionResult = await enforcePollRegion(request, reply, params.pollId);
    if (!regionResult || "statusCode" in regionResult) return;

    const snapshot = await getSnapshotByVersion(params.pollId, params.version);
    if (!snapshot || !snapshot.visible) {
      return reply.status(404).send({ error: "Snapshot not found" });
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
    const regionResult = await enforcePollRegion(request, reply, pollId);
    if (!regionResult || "statusCode" in regionResult) return;
    const { poll } = regionResult;

    if (poll.voterMode !== "public") {
      return reply.status(403).send({
        error: "Ballots are not available for anonymous polls",
      });
    }

    const ballots = await listBallots(pollId);
    return { ballots };
  });

  app.get("/polls/:pollId/ballots/:subjectId", async (request, reply) => {
    const params = z
      .object({ pollId: z.string().uuid(), subjectId: z.string() })
      .parse(request.params);
    const regionResult = await enforcePollRegion(request, reply, params.pollId);
    if (!regionResult || "statusCode" in regionResult) return;
    const { poll } = regionResult;

    if (poll.voterMode !== "public") {
      return reply.status(403).send({
        error: "Individual ballots are not retained for anonymous polls",
      });
    }

    const ballot = await getBallotBySubject(params.pollId, params.subjectId);
    if (!ballot) return reply.status(404).send({ error: "Ballot not found" });
    return ballot;
  });

  app.get("/polls/:pollId/participation", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const regionResult = await enforcePollRegion(request, reply, pollId);
    if (!regionResult || "statusCode" in regionResult) return;

    try {
      const auth = await requireVoterAuth(pollId, request.headers.authorization);
      const { getBallotBySubject: getBallot } = await import("@sondage/db");
      if (regionResult.poll.voterMode === "public") {
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
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
