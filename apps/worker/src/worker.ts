import { closeDb } from "@sondage/db";
import { perfLog } from "@sondage/shared";
import { workerConfig } from "./config.js";
import { assertStartupCompliance } from "./startup-compliance.js";
import {
  ensureConsumerGroupWithRetry,
  claimStalePendingEvents,
  readGroupEventsImmediate,
  readGroupPendingEvents,
  getStreamQueueStats,
  ackEvent,
  trimProcessedVoteEvents,
  closeRedis,
  type StreamQueueStats,
} from "./redis.js";
import { processVoteEventBatch } from "./processor.js";
import { maybePublishSnapshot } from "@sondage/db";

console.log(
  `[worker] starting consumer=${workerConfig.consumerName} group=${workerConfig.consumerGroup} stream=${workerConfig.voteEventsStream} poll=${workerConfig.pollIntervalMs}ms max/tick=${workerConfig.maxEventsPerTick} claim_idle=${workerConfig.claimMinIdleMs}ms trim=${workerConfig.voteStreamTrimEnabled}`
);

assertStartupCompliance();

await ensureConsumerGroupWithRetry();

type ProcessResult = {
  processed: number;
  aggregateMs: number;
  snapshotMs: number;
  fromOwnPel: number;
  fromClaim: number;
  fromNew: number;
  dirtyPollCount: number;
};

let tickRunning = false;
let tickSeq = 0;

function formatQueueStats(stats: StreamQueueStats): string {
  const tail = stats.lastDeliveredId ? ` last_id=${stats.lastDeliveredId}` : "";
  return `pel=${stats.pel} lag=${stats.lag} total=${stats.total}${tail}`;
}

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
        `[worker] failed event stream_id=${id} event_id=${event.eventId} poll=${event.pollId}:`,
        result.failed.find((f) => f.eventId === event.eventId)?.error
      );
      continue;
    }
    await ackEvent(id);
    acked += 1;
  }

  if (result.failed.length > 0) {
    console.warn(
      `[worker] batch partial ack stream_ids=${slice.length} acked=${acked} failed=${result.failed.length} duplicate=${result.duplicate}`
    );
  }

  return acked;
}

/** Traite jusqu'à maxEventsPerTick événements (PEL puis nouveaux messages). */
async function processPendingVotesUpTo(maxEvents: number): Promise<ProcessResult> {
  const aggregateStart = Date.now();
  let total = 0;
  let fromOwnPel = 0;
  let fromClaim = 0;
  let fromNew = 0;
  let snapshotMs = 0;
  const dirtyPolls = new Set<string>();

  while (total < maxEvents) {
    const pendingOwn = await readGroupPendingEvents();
    if (pendingOwn.length === 0) break;
    for (const { event } of pendingOwn) {
      dirtyPolls.add(event.pollId);
    }
    const acked = await processStreamEntries(pendingOwn, maxEvents - total);
    fromOwnPel += acked;
    total += acked;
  }

  while (total < maxEvents) {
    const reclaimed = await claimStalePendingEvents();
    if (reclaimed.length === 0) break;
    for (const { event } of reclaimed) {
      dirtyPolls.add(event.pollId);
    }
    const acked = await processStreamEntries(reclaimed, maxEvents - total);
    fromClaim += acked;
    total += acked;
  }

  while (total < maxEvents) {
    const batch = await readGroupEventsImmediate();
    if (batch.length === 0) break;
    for (const { event } of batch) {
      dirtyPolls.add(event.pollId);
    }
    const acked = await processStreamEntries(batch, maxEvents - total);
    fromNew += acked;
    total += acked;
  }

  for (const pollId of dirtyPolls) {
    try {
      const result = await maybePublishSnapshot(pollId);
      snapshotMs += result.snapshotMs ?? 0;
    } catch (err) {
      console.error(`[worker] snapshot failed poll=${pollId}:`, err);
    }
  }

  return {
    processed: total,
    aggregateMs: Date.now() - aggregateStart,
    snapshotMs,
    fromOwnPel,
    fromClaim,
    fromNew,
    dirtyPollCount: dirtyPolls.size,
  };
}

async function tick(): Promise<void> {
  if (tickRunning) {
    console.warn(
      `[worker] tick skipped — previous tick still running (${new Date().toISOString()})`
    );
    return;
  }

  tickRunning = true;
  const tickId = ++tickSeq;
  const tickStart = Date.now();

  try {
    const before = await getStreamQueueStats();
    if (before.total === 0) {
      const trimmed = await trimProcessedVoteEvents();
      if (trimmed > 0) {
        console.log(`[worker] tick #${tickId} trimmed=${trimmed} acked stream entries`);
      }
      console.log(`[worker] tick #${tickId} idle ${formatQueueStats(before)}`);
      perfLog("perf_worker_tick", {
        tick: tickId,
        idle: true,
        pel: before.pel,
        lag: before.lag,
        stream_trimmed: trimmed,
        duration_ms: Date.now() - tickStart,
      });
      return;
    }

    console.log(
      `[worker] tick #${tickId} begin ${formatQueueStats(before)} limit=${workerConfig.maxEventsPerTick}`
    );
    const result = await processPendingVotesUpTo(workerConfig.maxEventsPerTick);
    const trimmed = await trimProcessedVoteEvents();
    const after = await getStreamQueueStats();
    const durationMs = Date.now() - tickStart;

    console.log(
      `[worker] tick #${tickId} done processed=${result.processed} own_pel=${result.fromOwnPel} claimed=${result.fromClaim} new=${result.fromNew} snapshots=${result.dirtyPollCount} trimmed=${trimmed} remaining ${formatQueueStats(after)} duration_ms=${durationMs}`
    );

    if (result.processed === 0 && before.total > 0) {
      console.warn(
        `[worker] tick #${tickId} processed 0 despite queue ${formatQueueStats(before)} — check PEL ownership or consumer=${workerConfig.consumerName}`
      );
    }

    perfLog("perf_worker_tick", {
      tick: tickId,
      processed: result.processed,
      own_pel: result.fromOwnPel,
      claimed: result.fromClaim,
      new: result.fromNew,
      snapshots: result.dirtyPollCount,
      aggregate_ms: result.aggregateMs,
      snapshot_ms: result.snapshotMs,
      stream_trimmed: trimmed,
      pel_before: before.pel,
      lag_before: before.lag,
      pel_after: after.pel,
      lag_after: after.lag,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error(`[worker] tick #${tickId} error after ${Date.now() - tickStart}ms:`, err);
    throw err;
  } finally {
    tickRunning = false;
  }
}

await tick().catch((e) => console.error("[worker] initial tick error:", e));

const interval = setInterval(() => {
  tick().catch((e) => console.error("[worker] tick error:", e));
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
