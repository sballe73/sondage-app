import type { VoteSubmittedEvent } from "@sondage/shared";
import {
  getVoteCount,
  processVoteEventBatch as processVoteEventBatchCore,
  type ProcessVoteBatchResult,
} from "@sondage/db";
import { reconcileVoteCount } from "./redis.js";

export async function processVoteEventBatch(
  events: VoteSubmittedEvent[]
): Promise<ProcessVoteBatchResult> {
  if (events.length === 0) {
    return {
      processed: 0,
      duplicate: 0,
      processedByPoll: new Map(),
      failed: [],
    };
  }

  const pollIds = [...new Set(events.map((e) => e.pollId))];
  const countsBefore = new Map<string, number>();
  await Promise.all(
    pollIds.map(async (pollId) => {
      countsBefore.set(pollId, await getVoteCount(pollId));
    })
  );

  const result = await processVoteEventBatchCore(events);

  for (const [pollId, added] of result.processedByPoll) {
    if (added > 0) {
      const before = countsBefore.get(pollId) ?? 0;
      await reconcileVoteCount(pollId, before + added);
    }
  }

  return result;
}

/** @deprecated Préférer processVoteEventBatch ; conservé pour les tests un par un. */
export async function processVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  const result = await processVoteEventBatch([event]);
  if (result.failed.length > 0) {
    throw result.failed[0]!.error;
  }
}
