import type { VoteSubmittedEvent } from "../../packages/shared/dist/types.js";
import { config } from "../../apps/api/dist/config.js";
import { getRedis } from "../../apps/api/dist/redis.js";
import {
  isEventProcessed,
  markEventProcessed,
} from "../../packages/db/dist/index.js";
import { processVoteEvent } from "../../apps/worker/dist/processor.js";

function parseStreamPayload(fields: string[]): string | null {
  const payloadIdx = fields.indexOf("payload");
  if (payloadIdx < 0) return null;
  return fields[payloadIdx + 1] ?? null;
}

function isDuplicateParticipationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

/** Traite les événements en attente pour un sondage (comme le worker). */
export async function drainVoteEventsForPoll(pollId: string): Promise<number> {
  const redis = getRedis();
  const stream = config.voteEventsStream;
  const entries = await redis.xrange(stream, "-", "+");
  let processed = 0;

  for (const [, fields] of entries) {
    const raw = parseStreamPayload(fields);
    if (!raw) continue;
    const event = JSON.parse(raw) as VoteSubmittedEvent;
    if (event.pollId !== pollId) continue;
    if (await isEventProcessed(event.eventId)) continue;

    try {
      await processVoteEvent(event);
      processed += 1;
    } catch (err) {
      // Un worker externe peut avoir traité l'événement entre-temps.
      if (isDuplicateParticipationError(err)) {
        if (!(await isEventProcessed(event.eventId))) {
          await markEventProcessed(event.eventId, pollId);
        }
        continue;
      }
      throw err;
    }
  }

  return processed;
}
