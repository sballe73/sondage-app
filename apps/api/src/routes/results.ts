import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Platform, ResultPolicy } from "@sondage/shared";
import { hashSubjectForParticipation, labelForGrade } from "@sondage/shared";
import {
  getLatestVisibleSnapshot,
  getSnapshotByVersion,
  getVoteCount,
  getHistogramRows,
  listBallots,
  getBallotBySubject,
  listParticipation,
  maybePublishSnapshot,
  getPollById,
} from "@sondage/db";
import { enforcePollRegion } from "../middleware/region.js";
import { config } from "../config.js";
import {
  isResultsVisible,
} from "../services/results-policy.js";
import { getLiveVoteCount, hasParticipationClaim } from "../redis.js";
import { requireVoterAuth } from "./auth.js";
import { AppError } from "../errors.js";
import { toIsoString } from "../serialize-timestamp.js";

const CACHE_MAX_AGE_VISIBLE = 60;
const CACHE_MAX_AGE_HIDDEN = 15;

export async function resultsRoutes(app: FastifyInstance) {
  app.get("/polls/:pollId/results", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const { poll } = await enforcePollRegion(request, pollId);

    let dbCount = await getVoteCount(pollId);
    let voteCount = await getLiveVoteCount(pollId, dbCount);
    const aggregationPending = voteCount > dbCount;

    const policy = poll.resultPolicy as ResultPolicy;
    const snapshotOptions = {
      platform: poll.platform as Platform,
      mockSnapshotEveryVote: poll.mockSnapshotEveryVote,
    };
    const visible = isResultsVisible(
      policy,
      voteCount,
      poll.endsAt,
      new Date(),
      snapshotOptions
    );

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

    if (aggregationPending) {
      if (snapshot) {
        reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
        return {
          version: snapshot.version,
          voteCount: snapshot.voteCount,
          liveVoteCount: voteCount,
          computedAt: snapshot.computedAt,
          aggregationIntervalMs: config.aggregationIntervalMs,
          results: snapshot.payload,
        };
      }
      reply.header("Cache-Control", `private, max-age=${CACHE_MAX_AGE_HIDDEN}`);
      throw new AppError(
        404,
        "SNAPSHOT_NOT_FOUND",
        "No published snapshot yet",
        { voteCount }
      );
    }

    const needsSnapshot =
      !snapshot ||
      voteCount > snapshotVoteCount ||
      (pollEnded && snapshotVoteCount < voteCount);

    if (needsSnapshot) {
      await maybePublishSnapshot(pollId, { forceVisible: true });
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
      aggregationIntervalMs: config.aggregationIntervalMs,
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

  app.get("/polls/:pollId/attendance", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const { poll } = await enforcePollRegion(request, pollId);
    const data = await getPollById(pollId);
    if (!data) {
      throw new AppError(404, "NOT_FOUND", "Poll not found");
    }

    if (poll.voterMode === "anonymous") {
      const rows = await listParticipation(pollId);
      return {
        voterMode: poll.voterMode,
        voters: rows.map((row) => ({
          displayName: row.displayName ?? "Anonyme",
          platform: row.platform,
          participatedAt: toIsoString(row.participatedAt),
        })),
      };
    }

    const ballots = await listBallots(pollId);
    const itemLabels = new Map(data.items.map((item) => [item.id, item.label]));
    const gradeLabels = data.poll.gradeLabels;
    const gradeMin = data.poll.gradeMin;

    return {
      voterMode: poll.voterMode,
      voters: ballots.map((ballot) => ({
        displayName: ballot.displayName ?? "Anonyme",
        platform: ballot.platform,
        participatedAt: toIsoString(ballot.votedAt),
        grades: ballot.grades.map((g) => ({
          itemId: g.itemId,
          itemLabel: itemLabels.get(g.itemId) ?? g.itemId,
          grade: g.grade,
          gradeLabel: labelForGrade(g.grade, gradeLabels, gradeMin),
        })),
      })),
    };
  });

  app.get("/polls/:pollId/ballots/:subjectId", async (request, reply) => {
    const params = z
      .object({ pollId: z.string().uuid(), subjectId: z.string() })
      .parse(request.params);
    const query = z
      .object({ platform: z.enum(["facebook", "x", "linkedin", "google", "apple", "mock"]).optional() })
      .parse(request.query ?? {});
    const { poll } = await enforcePollRegion(request, params.pollId);

    if (poll.voterMode !== "public") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Individual ballots are not retained for anonymous polls"
      );
    }

    const platform = (query.platform ?? poll.platform) as Platform;
    const ballot = await getBallotBySubject(
      params.pollId,
      platform,
      params.subjectId
    );
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
      const ballot = await getBallot(
        pollId,
        auth.token.platform,
        auth.token.subjectId
      );
      if (ballot) {
        const votedAt = toIsoString(ballot.votedAt);
        return {
          voted: true,
          participatedAt: votedAt,
          ballot: { ...ballot, votedAt: votedAt ?? ballot.votedAt },
        };
      }
      const claimed = await hasParticipationClaim(
        pollId,
        auth.token.platform,
        auth.token.subjectId
      );
      if (claimed) {
        return { voted: true, pendingAggregation: true };
      }
      return { voted: false };
    }
    const { schema, getDb } = await import("@sondage/db");
    const { eq, and } = await import("drizzle-orm");
    const db = getDb();
    const participationSubject = hashSubjectForParticipation(
      pollId,
      auth.token.subjectId,
      process.env.PARTICIPATION_HASH_SALT ?? "dev-salt"
    );
    const [row] = await db
      .select()
      .from(schema.voteParticipation)
      .where(
        and(
          eq(schema.voteParticipation.pollId, pollId),
          eq(schema.voteParticipation.platform, auth.token.platform),
          eq(schema.voteParticipation.subjectId, participationSubject)
        )
      );
    if (row) {
      return {
        voted: true,
        participatedAt: toIsoString(row.participatedAt),
      };
    }
    const claimed = await hasParticipationClaim(
      pollId,
      auth.token.platform,
      auth.token.subjectId
    );
    if (claimed) {
      return { voted: true, pendingAggregation: true };
    }
    return { voted: false };
  });
}
