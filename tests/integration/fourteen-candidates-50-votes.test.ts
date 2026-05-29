/**
 * Test d'intégration validé : 14 candidats, 50 votes figés, checkpoints 10/20/30/40/50.
 *
 * Fixture figée : tests/fixtures/fourteen-candidates-50-votes.json (meta.frozen)
 * Prérequis : PostgreSQL (DATABASE_URL), migrations appliquées, Redis (REDIS_URL).
 * Régénérer (algorithme MJ modifié) : npm run test:integration:generate -- --force
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPoll,
  getLatestVisibleSnapshot,
  getVoteCount,
  closeDb,
} from "../../packages/db/dist/index.js";
import type { CreatePollInput } from "../../packages/shared/dist/types.js";
import { processVoteEvent } from "../../apps/worker/dist/processor.js";
import { closeRedis } from "../../apps/worker/dist/redis.js";
import {
  normalizeResultsPayload,
  type IntegrationFixture,
} from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  "../fixtures/fourteen-candidates-50-votes.json"
);

const fixture = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
) as IntegrationFixture;

const hasDb = !!process.env.DATABASE_URL;

describe("Integration: 14 candidats, 50 votants, seuils /10", { skip: !hasDb }, () => {
  before(() => {
    if (!hasDb) {
      console.warn("DATABASE_URL absent — test d'intégration ignoré");
    }
  });

  after(async () => {
    if (!hasDb) return;
    await closeRedis();
    await closeDb();
  });

  it("rejoue les votes figés et vérifie les checkpoints 10/20/30/40/50", async () => {
    const p = fixture.poll;
    const input: CreatePollInput = {
      name: p.name,
      creatorId: p.creatorId,
      platform: p.platform as CreatePollInput["platform"],
      items: p.items,
      gradeMin: p.gradeMin,
      gradeMax: p.gradeMax,
      gradeLabels: p.gradeLabels,
      bestGradeIsLowest: p.bestGradeIsLowest,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      visibility: p.visibility as CreatePollInput["visibility"],
      voterMode: p.voterMode as CreatePollInput["voterMode"],
      resultPolicy: p.resultPolicy as CreatePollInput["resultPolicy"],
      dataRegion: p.dataRegion as CreatePollInput["dataRegion"],
    };

    const { poll, items } = await createPoll(input);
    const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    assert.strictEqual(sortedItems.length, 14);

    const checkpointByCount = new Map(
      fixture.checkpoints.map((c) => [c.afterVoteCount, c])
    );

    for (let v = 0; v < fixture.votes.length; v++) {
      const vote = fixture.votes[v]!;
      await processVoteEvent({
        eventId: `${poll.id}-fixture-vote-${v}`,
        pollId: poll.id,
        platform: "mock",
        subjectId: vote.subjectId,
        displayName: vote.displayName,
        grades: vote.grades.map((grade, idx) => ({
          itemId: sortedItems[idx]!.id,
          grade,
        })),
        voterMode: "public",
        submittedAt: new Date().toISOString(),
      });

      const count = await getVoteCount(poll.id);
      assert.strictEqual(count, v + 1);

      const checkpoint = checkpointByCount.get(count);
      if (!checkpoint) continue;

      const snap = await getLatestVisibleSnapshot(poll.id);
      assert.ok(snap, `snapshot attendu après ${count} votes`);
      assert.strictEqual(snap!.visible, true);

      const actual = normalizeResultsPayload(
        snap!.payload as Parameters<typeof normalizeResultsPayload>[0]
      );
      const expected = normalizeResultsPayload(checkpoint.expected);

      assert.deepStrictEqual(
        actual,
        expected,
        `Résultats différents après ${count} votes — régénérez la fixture si vous avez changé l'algorithme MJ`
      );
    }

    assert.strictEqual(await getVoteCount(poll.id), 50);
  });
});
