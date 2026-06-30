import { getPollById } from "@sondage/db";

export type PollData = NonNullable<Awaited<ReturnType<typeof getPollById>>>;

const TTL_MS = Number(process.env.POLL_CACHE_TTL_MS ?? 60_000);
const cache = new Map<string, { data: PollData; expiresAt: number }>();

export async function getPollByIdCached(pollId: string): Promise<PollData | null> {
  const now = Date.now();
  const hit = cache.get(pollId);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const data = await getPollById(pollId);
  if (data) {
    cache.set(pollId, { data, expiresAt: now + TTL_MS });
  } else {
    cache.delete(pollId);
  }
  return data;
}

/** Test helper — clears in-memory poll cache. */
export function clearPollCache() {
  cache.clear();
}
