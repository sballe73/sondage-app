import { Redis as RedisClient } from "ioredis";
import { config } from "./config.js";

let redis: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!redis) {
    redis = new RedisClient(config.redisUrl, { maxRetriesPerRequest: 3 });
  }
  return redis;
}

export async function closeRedis() {
  if (!redis) return;
  const client = redis;
  redis = null;
  client.removeAllListeners();
  client.options.retryStrategy = () => null;
  try {
    await Promise.race([
      client.quit(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Redis quit timeout")), 3_000)
      ),
    ]);
  } catch {
    client.disconnect();
  }
}

function participationKey(pollId: string, subjectId: string) {
  return `participation:${pollId}:${subjectId}`;
}

function voteCountKey(pollId: string) {
  return `vote_count:${pollId}`;
}

function idempotencyKey(pollId: string, key: string) {
  return `idempotency:${pollId}:${key}`;
}

function voteRateLimitKey(pollId: string, subjectId: string) {
  return `rate:vote:${pollId}:${subjectId}`;
}

export type VoteRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number; count: number };

/** Limite les tentatives de vote par (poll, subject) — fenêtre glissante 60 s. */
export async function checkVoteRateLimit(
  pollId: string,
  subjectId: string,
  maxPerMinute: number
): Promise<VoteRateLimitResult> {
  const r = getRedis();
  const key = voteRateLimitKey(pollId, subjectId);
  const count = await r.incr(key);
  if (count === 1) {
    await r.expire(key, 60);
  }
  if (count > maxPerMinute) {
    const ttl = await r.ttl(key);
    return {
      allowed: false,
      retryAfterSec: Math.max(ttl, 1),
      count,
    };
  }
  return { allowed: true };
}

export async function hasParticipationClaim(
  pollId: string,
  subjectId: string
): Promise<boolean> {
  const val = await getRedis().get(participationKey(pollId, subjectId));
  return val === "1";
}

export async function tryClaimVote(
  pollId: string,
  subjectId: string,
  endsAt: Date,
  idempotencyKeyValue?: string
): Promise<"claimed" | "already_voted" | "idempotent_replay"> {
  const r = getRedis();
  const ttlSeconds = Math.max(
    60,
    Math.ceil((endsAt.getTime() - Date.now()) / 1000) + 86400
  );

  if (idempotencyKeyValue) {
    const idemKey = idempotencyKey(pollId, idempotencyKeyValue);
    const existing = await r.get(idemKey);
    if (existing === "accepted") return "idempotent_replay";
  }

  const partKey = participationKey(pollId, subjectId);
  const set = await r.set(partKey, "1", "EX", ttlSeconds, "NX");
  if (set !== "OK") {
    return "already_voted";
  }

  if (idempotencyKeyValue) {
    await r.set(
      idempotencyKey(pollId, idempotencyKeyValue),
      "accepted",
      "EX",
      ttlSeconds
    );
  }

  await r.incr(voteCountKey(pollId));
  return "claimed";
}

export async function releaseVoteClaim(pollId: string, subjectId: string) {
  const r = getRedis();
  const deleted = await r.del(participationKey(pollId, subjectId));
  if (deleted > 0) {
    const current = await r.decr(voteCountKey(pollId));
    if (current < 0) {
      await r.set(voteCountKey(pollId), "0");
    }
  }
}

export async function getVoteCountRedis(pollId: string): Promise<number> {
  const v = await getRedis().get(voteCountKey(pollId));
  return v ? parseInt(v, 10) : 0;
}

export async function syncVoteCountFromDb(pollId: string, count: number) {
  const key = voteCountKey(pollId);
  const current = await getVoteCountRedis(pollId);
  if (count > current) {
    await getRedis().set(key, String(count));
  }
}

/** Votes acceptés (clés participation Redis), y compris avant compteur vote_count. */
export async function countParticipationClaims(pollId: string): Promise<number> {
  const r = getRedis();
  const pattern = `participation:${pollId}:*`;
  let count = 0;
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    count += keys.length;
  } while (cursor !== "0");
  return count;
}

/** max(Postgres traités, compteur Redis, participations enregistrées). */
export async function getLiveVoteCount(
  pollId: string,
  dbCount: number
): Promise<number> {
  await syncVoteCountFromDb(pollId, dbCount);
  const [counter, claimed] = await Promise.all([
    getVoteCountRedis(pollId),
    countParticipationClaims(pollId),
  ]);
  return Math.max(dbCount, counter, claimed);
}
