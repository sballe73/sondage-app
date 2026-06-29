import type { VoteSubmittedEvent } from "@sondage/shared";
import { config } from "../config.js";
import { getRedis } from "../redis.js";
import {
  getVoteCount,
  processVoteEventBatch,
  maybePublishSnapshot,
} from "@sondage/db";
import { syncVoteCountFromDb } from "../redis.js";

const STREAM_PAGE_SIZE = 200;
/** Limite le scan du stream (évite XRANGE complet sur gros backlog). */
const MAX_STREAM_ENTRIES_SCANNED = 10_000;

function parseStreamPayload(fields: string[]): string | null {
  const payloadIdx = fields.indexOf("payload");
  if (payloadIdx < 0) return null;
  return fields[payloadIdx + 1] ?? null;
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function isPgUniqueViolationInFailures(
  failed: { eventId: string; error: unknown }[]
): boolean {
  return failed.length > 0 && failed.every((f) => isPgUniqueViolation(f.error));
}

/** Collecte les événements d'un sondage en parcourant le stream par pages. */
async function collectPollEventsFromStream(
  pollId: string,
  maxEvents: number
): Promise<VoteSubmittedEvent[]> {
  const redis = getRedis();
  const stream = config.voteEventsStream;
  const candidates: VoteSubmittedEvent[] = [];
  let start = "-";
  let scanned = 0;

  while (candidates.length < maxEvents && scanned < MAX_STREAM_ENTRIES_SCANNED) {
    const page = (await redis.xrange(
      stream,
      start,
      "+",
      "COUNT",
      STREAM_PAGE_SIZE
    )) as [string, string[]][];
    if (page.length === 0) break;

    scanned += page.length;
    for (const [, fields] of page) {
      const raw = parseStreamPayload(fields);
      if (!raw) continue;
      const event = JSON.parse(raw) as VoteSubmittedEvent;
      if (event.pollId !== pollId) continue;
      candidates.push(event);
      if (candidates.length >= maxEvents) break;
    }

    if (page.length < STREAM_PAGE_SIZE) break;
    const lastId = page[page.length - 1]![0];
    start = `(${lastId}`;
  }

  return candidates;
}

/**
 * Rattrape les votes non agrégés pour un sondage (tests / scripts — pas le chemin HTTP).
 */
export async function drainVoteEventsForPoll(
  pollId: string,
  maxEvents = 50
): Promise<number> {
  const candidates = await collectPollEventsFromStream(pollId, maxEvents);
  if (candidates.length === 0) {
    return 0;
  }

  const result = await processVoteEventBatch(candidates);
  if (result.failed.length > 0 && !isPgUniqueViolationInFailures(result.failed)) {
    throw result.failed[0]!.error;
  }

  const processed = result.processed;

  if (processed > 0) {
    await maybePublishSnapshot(pollId);
    const dbCount = await getVoteCount(pollId);
    await syncVoteCountFromDb(pollId, dbCount);
  }

  return processed;
}
