import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPoll,
  getLatestVisibleSnapshot,
  getVoteCount,
  closeDb,
} from "../packages/db/dist/index.js";
import { closeRedis } from "../apps/worker/dist/redis.js";
import type { CreatePollInput } from "../packages/shared/dist/types.js";
import { processVoteEvent } from "../apps/worker/dist/processor.js";
import {
  normalizeResultsPayload,
  type IntegrationFixture,
} from "../tests/integration/helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../tests/fixtures/fourteen-candidates-50-votes.json"),
    "utf8"
  )
) as IntegrationFixture;

async function main() {
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
  console.log("Poll créé:", poll.id, "items:", sortedItems.length);

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
    const checkpoint = checkpointByCount.get(count);
    if (!checkpoint) continue;

    const snap = await getLatestVisibleSnapshot(poll.id);
    if (!snap) {
      console.error("Pas de snapshot à", count);
      process.exit(1);
    }
    const actual = normalizeResultsPayload(snap.payload as never);
    const expected = normalizeResultsPayload(checkpoint.expected);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error("Différence après", count, "votes");
      console.error(JSON.stringify({ actual, expected }, null, 2).slice(0, 2000));
      process.exit(1);
    }
    console.log("OK checkpoint", count);
  }
  console.log("Tous les checkpoints OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await closeDb();
  });
