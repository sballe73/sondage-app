import { closeDb } from "@sondage/db";
import { perfLog } from "@sondage/shared";
import { workerConfig } from "./config.js";
import { assertStartupCompliance } from "./startup-compliance.js";
import {
  ensureConsumerGroupWithRetry,
  claimStalePendingEvents,
  readGroupEventsImmediate,
  getPendingVoteWork,
  ackEvent,
  closeRedis,
} from "./redis.js";
import { processVoteEvent } from "./processor.js";
import { maybePublishSnapshot } from "@sondage/db";

console.log(
  `Worker ${workerConfig.consumerName} starting (poll every ${workerConfig.pollIntervalMs}ms)...`
);

assertStartupCompliance();

await ensureConsumerGroupWithRetry();

type ProcessResult = {
  processed: number;
  aggregateMs: number;
  snapshotMs: number;
};

/** Vide le backlog : PEL périmés puis nouveaux événements jusqu'à épuisement. */
async function processAllPendingVotes(): Promise<ProcessResult> {
  const aggregateStart = Date.now();
  let total = 0;
  let snapshotMs = 0;
  const dirtyPolls = new Set<string>();

  for (;;) {
    const reclaimed = await claimStalePendingEvents();
    if (reclaimed.length === 0) break;
    for (const { id, event } of reclaimed) {
      try {
        await processVoteEvent(event);
        await ackEvent(id);
        dirtyPolls.add(event.pollId);
        total += 1;
      } catch (err) {
        console.error(`Failed event ${id}:`, err);
      }
    }
  }

  for (;;) {
    const batch = await readGroupEventsImmediate();
    if (batch.length === 0) break;
    for (const { id, event } of batch) {
      try {
        await processVoteEvent(event);
        await ackEvent(id);
        dirtyPolls.add(event.pollId);
        total += 1;
      } catch (err) {
        console.error(`Failed event ${id}:`, err);
      }
    }
  }

  for (const pollId of dirtyPolls) {
    try {
      const result = await maybePublishSnapshot(pollId);
      snapshotMs += result.snapshotMs ?? 0;
    } catch (err) {
      console.error(`Failed snapshot for poll ${pollId}:`, err);
    }
  }

  return {
    processed: total,
    aggregateMs: Date.now() - aggregateStart,
    snapshotMs,
  };
}

async function tick(): Promise<void> {
  const pending = await getPendingVoteWork();
  if (pending === 0) {
    console.log(`[worker] No new votes (${new Date().toISOString()})`);
    return;
  }

  console.log(
    `[worker] ~${pending} vote event(s) pending — processing (${new Date().toISOString()})...`
  );
  const { processed, aggregateMs, snapshotMs } = await processAllPendingVotes();
  console.log(`[worker] Processed ${processed} vote event(s)`);
  perfLog("perf_worker_tick", { processed, aggregate_ms: aggregateMs, snapshot_ms: snapshotMs });
}

await tick().catch((e) => console.error("Initial tick error:", e));

const interval = setInterval(() => {
  tick().catch((e) => console.error("Tick error:", e));
}, workerConfig.pollIntervalMs);

process.on("SIGINT", async () => {
  clearInterval(interval);
  await closeRedis();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearInterval(interval);
  await closeRedis();
  await closeDb();
  process.exit(0);
});
