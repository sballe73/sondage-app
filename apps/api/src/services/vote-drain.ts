import type { VoteSubmittedEvent } from "@sondage/shared";
import { config } from "../config.js";
import { getRedis } from "../redis.js";
import {
  isEventProcessed,
  markEventProcessed,
} from "@sondage/db";
import { processVoteEvent } from "@sondage/worker/processor";

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

/** Rattrape les votes non agrégés pour un sondage (filet de sécurité si le worker est en retard). */
export async function drainVoteEventsForPoll(
  pollId: string,
  maxEvents = 50
): Promise<number> {
  const redis = getRedis();
  const stream = config.voteEventsStream;
  const entries = await redis.xrange(stream, "-", "+");
  let processed = 0;

  for (const [, fields] of entries) {
    if (processed >= maxEvents) break;
    const raw = parseStreamPayload(fields);
    if (!raw) continue;
    const event = JSON.parse(raw) as VoteSubmittedEvent;
    if (event.pollId !== pollId) continue;
    if (await isEventProcessed(event.eventId)) continue;

    try {
      await processVoteEvent(event);
      processed += 1;
    } catch (err) {
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
