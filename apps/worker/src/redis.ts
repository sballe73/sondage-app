import { Redis as RedisClient } from "ioredis";
import { workerConfig } from "./config.js";

let redis: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!redis) {
    redis = new RedisClient(workerConfig.redisUrl, {
      connectTimeout: 5_000,
      maxRetriesPerRequest: 3,
    });
  }
  return redis;
}

export async function reconcileVoteCount(
  pollId: string,
  dbCount: number
): Promise<void> {
  const key = `vote_count:${pollId}`;
  const r = getRedis();
  const raw = await r.get(key);
  const current = raw ? parseInt(raw, 10) : 0;
  if (dbCount > current) {
    await r.set(key, String(dbCount));
  }
}

function isMissingConsumerGroupError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("NOGROUP") || msg.includes("NOSTREAM");
}

function parseStreamMessages(
  messages: [string, string[]][]
): { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[] {
  return messages.map(([id, fields]) => {
    const payloadIdx = fields.indexOf("payload");
    const payload = fields[payloadIdx + 1] ?? "{}";
    return {
      id,
      event: JSON.parse(payload) as import("@sondage/shared").VoteSubmittedEvent,
    };
  });
}

export async function ensureConsumerGroup(): Promise<void> {
  const r = getRedis();
  try {
    await r.xgroup(
      "CREATE",
      workerConfig.voteEventsStream,
      workerConfig.consumerGroup,
      "0",
      "MKSTREAM"
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes("BUSYGROUP")) throw e;
  }
}

export async function ensureConsumerGroupWithRetry(
  attempts = 10,
  delayMs = 1_000
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await ensureConsumerGroup();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function readGroupEventsOnce(
  r: RedisClient,
  blockMs = workerConfig.blockMs
): Promise<{ id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]> {
  const rows = await r.xreadgroup(
    "GROUP",
    workerConfig.consumerGroup,
    workerConfig.consumerName,
    "COUNT",
    workerConfig.batchSize,
    "BLOCK",
    blockMs,
    "STREAMS",
    workerConfig.voteEventsStream,
    ">"
  );
  if (!rows) return [];
  const [, messages] = rows[0] as [string, [string, string[]][]];
  return parseStreamMessages(messages);
}

/** Reclaim events stuck in PEL after a worker crash (idle > minIdleMs). */
export async function claimStalePendingEvents(
  minIdleMs = 60_000
): Promise<{ id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]> {
  const r = getRedis();
  try {
    const result = (await r.xautoclaim(
      workerConfig.voteEventsStream,
      workerConfig.consumerGroup,
      workerConfig.consumerName,
      minIdleMs,
      "0-0",
      "COUNT",
      workerConfig.batchSize
    )) as [string, [string, string[]][], string[]];
    const messages = result[1] ?? [];
    return parseStreamMessages(messages);
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return [];
  }
}

export async function readGroupEvents(): Promise<
  { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]
> {
  const r = getRedis();
  try {
    return await readGroupEventsOnce(r);
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return readGroupEventsOnce(r);
  }
}

/** Lecture immédiate (sans attente) pour vider le lag du consumer group. */
export async function readGroupEventsImmediate(): Promise<
  { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]
> {
  const r = getRedis();
  try {
    return await readGroupEventsOnce(r, 0);
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return readGroupEventsOnce(r, 0);
  }
}

export async function ackEvent(id: string): Promise<void> {
  await getRedis().xack(
    workerConfig.voteEventsStream,
    workerConfig.consumerGroup,
    id
  );
}

export async function closeRedis() {
  if (!redis) return;
  const client = redis;
  redis = null;
  client.removeAllListeners();
  // Stop reconnect loops that would keep the Node event loop alive after tests.
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
