import type { VoteSubmittedEvent } from "@sondage/shared";
import { getVoteCount, processVoteEvent as processVoteEventCore } from "@sondage/db";
import { reconcileVoteCount } from "./redis.js";

export async function processVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  const before = await getVoteCount(event.pollId);
  await processVoteEventCore(event);
  const after = await getVoteCount(event.pollId);
  if (after > before) {
    await reconcileVoteCount(event.pollId, after);
  }
}
