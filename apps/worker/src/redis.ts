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

export async function readGroupEvents(): Promise<
  { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]
> {
  const r = getRedis();
  const rows = await r.xreadgroup(
    "GROUP",
    workerConfig.consumerGroup,
    workerConfig.consumerName,
    "COUNT",
    workerConfig.batchSize,
    "BLOCK",
    workerConfig.blockMs,
    "STREAMS",
    workerConfig.voteEventsStream,
    ">"
  );
  if (!rows) return [];
  const [, messages] = rows[0] as [string, [string, string[]][]];
  return messages.map(([id, fields]) => {
    const payloadIdx = fields.indexOf("payload");
    const payload = fields[payloadIdx + 1] ?? "{}";
    return {
      id,
      event: JSON.parse(payload) as import("@sondage/shared").VoteSubmittedEvent,
    };
  });
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
