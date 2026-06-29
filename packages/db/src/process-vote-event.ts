import type { VoteSubmittedEvent } from "@sondage/shared";
import { processVoteEventBatch } from "./process-vote-batch.js";

export async function processVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  const result = await processVoteEventBatch([event]);
  if (result.failed.length > 0) {
    throw result.failed[0]!.error;
  }
}

export { processVoteEventBatch } from "./process-vote-batch.js";
export type { ProcessVoteBatchResult } from "./process-vote-batch.js";
