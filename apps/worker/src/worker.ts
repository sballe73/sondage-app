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
  trimProcessedVoteEvents,
  closeRedis,
} from "./redis.js";
import { processVoteEventBatch } from "./processor.js";
import { maybePublishSnapshot } from "@sondage/db";

console.log(
  `Worker ${workerConfig.consumerName} starting (poll every ${workerConfig.pollIntervalMs}ms, max ${workerConfig.maxEventsPerTick} events/tick)...`
);

assertStartupCompliance();

await ensureConsumerGroupWithRetry();

type ProcessResult = {
  processed: number;
  aggregateMs: number;
  snapshotMs: number;
};

let tickRunning = false;

async function processStreamEntries(
  entries: { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[],
  limit: number
): Promise<number> {
  if (entries.length === 0 || limit <= 0) return 0;

  const slice = entries.slice(0, limit);
  const result = await processVoteEventBatch(slice.map((e) => e.event));
  const failedIds = new Set(result.failed.map((f) => f.eventId));
  let acked = 0;

  for (const { id, event } of slice) {
    if (failedIds.has(event.eventId)) {
      console.error(
        `Failed event ${id}:`,
        result.failed.find((f) => f.eventId === event.eventId)?.error
      );
      continue;
    }
    await ackEvent(id);
    acked += 1;
  }

  return acked;
}

/** Traite jusqu'à maxEventsPerTick événements (PEL puis nouveaux messages). */
async function processPendingVotesUpTo(maxEvents: number): Promise<ProcessResult> {
  const aggregateStart = Date.now();
  let total = 0;
  let snapshotMs = 0;
  const dirtyPolls = new Set<string>();

  while (total < maxEvents) {
    const reclaimed = await claimStalePendingEvents();
    if (reclaimed.length === 0) break;
    for (const { event } of reclaimed) {
      dirtyPolls.add(event.pollId);
    }
    total += await processStreamEntries(reclaimed, maxEvents - total);
  }

  while (total < maxEvents) {
    const batch = await readGroupEventsImmediate();
    if (batch.length === 0) break;
    for (const { event } of batch) {
      dirtyPolls.add(event.pollId);
    }
    total += await processStreamEntries(batch, maxEvents - total);
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
  if (tickRunning) {
    return;
  }
  tickRunning = true;
  try {
    const pending = await getPendingVoteWork();
    if (pending === 0) {
      const trimmed = await trimProcessedVoteEvents();
      if (trimmed > 0) {
        console.log(`[worker] Trimmed ${trimmed} acked stream entries`);
      }
      console.log(`[worker] No new votes (${new Date().toISOString()})`);
      return;
    }

    console.log(
      `[worker] ~${pending} vote event(s) pending — processing up to ${workerConfig.maxEventsPerTick} (${new Date().toISOString()})...`
    );
    const { processed, aggregateMs, snapshotMs } = await processPendingVotesUpTo(
      workerConfig.maxEventsPerTick
    );
    const trimmed = await trimProcessedVoteEvents();
    console.log(`[worker] Processed ${processed} vote event(s)`);
    perfLog("perf_worker_tick", {
      processed,
      aggregate_ms: aggregateMs,
      snapshot_ms: snapshotMs,
      stream_trimmed: trimmed,
    });
  } finally {
    tickRunning = false;
  }
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
