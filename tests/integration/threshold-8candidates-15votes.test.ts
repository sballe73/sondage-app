/**
 * Parcours seuil /10 : 8 candidats, votes par batch, vues créateur/résultats, snapshot final.
 *
 * Prérequis : DATABASE_URL, REDIS_URL, migrations appliquées.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  getLatestVisibleSnapshot,
  getSnapshotByVersion,
  closeDb,
  getDb,
  schema,
} from "../../packages/db/dist/index.js";
import { closeRedis as closeApiRedis } from "../../apps/api/dist/redis.js";
import { closeRedis as closeWorkerRedis } from "../../apps/worker/dist/redis.js";
import { buildApiApp } from "./build-api-app.js";
import {
  fetchCreatorWidgetView,
  fetchResultsWidgetView,
} from "./widget-views.js";
import { drainVoteEventsForPoll } from "./vote-stream.js";
import { Redis } from "ioredis";

const hasEnv = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

const CANDIDATE_LABELS = [
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Option E",
  "Option F",
  "Option G",
  "Option H",
];

function pollWindowOneDay() {
  const startsAt = new Date();
  startsAt.setMinutes(startsAt.getMinutes() - 5);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

async function setPollEndsAt(pollId: string, endsAt: Date) {
  await getDb()
    .update(schema.polls)
    .set({ endsAt })
    .where(eq(schema.polls.id, pollId));
}

describe(
  "Integration: 8 candidats, seuil /10, vues créateur & résultats",
  { skip: !hasEnv },
  () => {
    let app: Awaited<ReturnType<typeof buildApiApp>>;
    let pollId: string;
    let itemIds: string[];

    before(async () => {
      if (!hasEnv) return;
      process.env.RATE_LIMIT_ENABLED = "false";

      const flush = new Redis(process.env.REDIS_URL!);
      await flush.flushdb();
      await flush.quit();

      app = await buildApiApp();

      const window = pollWindowOneDay();
      const createRes = await app.inject({
        method: "POST",
        url: "/polls",
        headers: {
          "Content-Type": "application/json",
          "X-Data-Region": "EU",
        },
        payload: {
          name: "Test intégration — 8 candidats / seuil 10",
          creatorId: "integration-test",
          platform: "mock",
          items: CANDIDATE_LABELS.map((label, sortOrder) => ({
            label,
            sortOrder,
          })),
          gradeMin: 1,
          gradeMax: 7,
          visibility: "public",
          voterMode: "public",
          resultPolicy: "threshold_10",
          dataRegion: "EU",
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        },
      });

      assert.equal(createRes.statusCode, 201, createRes.body);
      const poll = createRes.json() as {
        id: string;
        items: { id: string; sortOrder: number }[];
      };
      pollId = poll.id;
      itemIds = [...poll.items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => i.id);
      assert.equal(itemIds.length, 8);
    });

    after(async () => {
      if (!hasEnv) return;
      await app.close();
      await closeApiRedis();
      await closeWorkerRedis();
      await closeDb();
    });

    async function castVotes(from: number, count: number) {
      for (let i = 0; i < count; i++) {
        const n = from + i;
        const subjectId = `threshold-ui-${pollId.slice(0, 8)}-${n}`;
        const loginRes = await app.inject({
          method: "POST",
          url: "/auth/mock/login",
          headers: { "Content-Type": "application/json" },
          payload: {
            pollId,
            platform: "mock",
            subjectId,
            displayName: `Votant ${n}`,
          },
        });
        assert.equal(loginRes.statusCode, 200, loginRes.body);
        const { accessToken } = loginRes.json() as { accessToken: string };

        const voteRes = await app.inject({
          method: "POST",
          url: `/polls/${pollId}/votes`,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-Data-Region": "EU",
          },
          payload: {
            grades: itemIds.map((itemId, idx) => ({
              itemId,
              grade: 1 + ((n + idx) % 7),
            })),
          },
        });
        assert.equal(voteRes.statusCode, 202, voteRes.body);
      }
      await drainVoteEventsForPoll(pollId);
    }

    async function assertWidgetCounts(expected: number, label: string) {
      const creator = await fetchCreatorWidgetView(app, pollId);
      const results = await fetchResultsWidgetView(app, pollId);

      assert.equal(
        creator.displayedVoteCount,
        expected,
        `${label} — créateur`
      );
      assert.equal(
        results.displayedVoteCount,
        expected,
        `${label} — résultats`
      );
      assert.equal(
        creator.poll.voteCount as number,
        expected,
        `${label} — GET /polls voteCount`
      );
    }

    it("seuil /10 : 5 → masqué, 10 → snapshot v1, 15 → snapshot v2, fin → v2", async () => {
      await castVotes(1, 5);
      await assertWidgetCounts(5, "après 5 votes");

      let results = await fetchResultsWidgetView(app, pollId);
      assert.equal(results.resultsStatus, 403);
      assert.equal(results.resultsBody.code, "RESULTS_NOT_VISIBLE");
      assert.ok(!(await getLatestVisibleSnapshot(pollId)));

      await castVotes(6, 5);
      await assertWidgetCounts(10, "après 10 votes");

      results = await fetchResultsWidgetView(app, pollId);
      assert.equal(results.resultsStatus, 200);
      assert.equal(results.snapshotVersion, 1);
      assert.equal(results.snapshotVoteCount, 10);
      assert.equal(results.liveVoteCount, 10);

      let snap = await getLatestVisibleSnapshot(pollId);
      assert.ok(snap);
      assert.equal(snap!.version, 1);
      assert.equal(snap!.voteCount, 10);

      await castVotes(11, 5);
      await assertWidgetCounts(15, "après 15 votes");

      results = await fetchResultsWidgetView(app, pollId);
      assert.equal(results.resultsStatus, 200);
      assert.equal(results.snapshotVersion, 2);
      assert.equal(results.snapshotVoteCount, 15);
      assert.equal(results.liveVoteCount, 15);

      snap = await getLatestVisibleSnapshot(pollId);
      assert.ok(snap);
      assert.equal(snap!.version, 2);
      assert.equal(snap!.voteCount, 15);

      await setPollEndsAt(pollId, new Date(Date.now() - 60_000));

      results = await fetchResultsWidgetView(app, pollId);
      assert.equal(results.resultsStatus, 200);
      assert.equal(results.snapshotVersion, 2);
      assert.equal(results.snapshotVoteCount, 15);
      assert.equal(results.liveVoteCount, 15);

      await assertWidgetCounts(15, "après clôture");

      snap = await getLatestVisibleSnapshot(pollId);
      assert.ok(snap);
      assert.equal(snap!.version, 2);
      assert.equal(snap!.voteCount, 15);

      const v1 = await getSnapshotByVersion(pollId, 1);
      assert.ok(v1);
      assert.equal(v1!.voteCount, 10);
    });
  }
);
