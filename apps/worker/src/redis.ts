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

function groupEntryToMap(entry: unknown): Record<string, string | number> {
  if (!Array.isArray(entry)) {
    return (entry ?? {}) as Record<string, string | number>;
  }
  const map: Record<string, string | number> = {};
  for (let i = 0; i < entry.length; i += 2) {
    map[String(entry[i])] = entry[i + 1] as string | number;
  }
  return map;
}

type ConsumerGroupInfo = {
  pending: number;
  lag: number;
  lastDeliveredId: string | null;
};

function parseConsumerGroupInfo(
  raw: unknown,
  groupName: string
): ConsumerGroupInfo | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    const map = groupEntryToMap(entry);
    if (map.name === groupName) {
      const lastDeliveredId = map["last-delivered-id"];
      return {
        pending: Number(map.pending ?? 0),
        lag: Number(map.lag ?? 0),
        lastDeliveredId:
          typeof lastDeliveredId === "string" ? lastDeliveredId : null,
      };
    }
  }
  return null;
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

/** Nombre d'événements en attente (PEL + lag du consumer group). */
export async function getPendingVoteWork(): Promise<number> {
  const r = getRedis();
  try {
    const [pendingSummary, groups] = await Promise.all([
      r.xpending(
        workerConfig.voteEventsStream,
        workerConfig.consumerGroup
      ) as Promise<[number, string, string, unknown[]]>,
      r.xinfo("GROUPS", workerConfig.voteEventsStream),
    ]);
    const pel = Number(pendingSummary?.[0] ?? 0);
    const info = parseConsumerGroupInfo(groups, workerConfig.consumerGroup);
    const lag = Number(info?.lag ?? 0);
    return pel + lag;
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return 0;
  }
}

async function readGroupEventsOnce(
  r: RedisClient,
  streamId: ">" | "0"
): Promise<{ id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]> {
  const rows = await r.xreadgroup(
    "GROUP",
    workerConfig.consumerGroup,
    workerConfig.consumerName,
    "COUNT",
    workerConfig.streamReadCount,
    "STREAMS",
    workerConfig.voteEventsStream,
    streamId
  );
  if (!rows) return [];
  const [, messages] = rows[0] as [string, [string, string[]][]];
  return parseStreamMessages(messages);
}

/** PEL de ce consumer (messages livrés mais pas encore ack). */
export async function readGroupPendingEvents(): Promise<
  { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]
> {
  const r = getRedis();
  try {
    return await readGroupEventsOnce(r, "0");
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return readGroupEventsOnce(r, "0");
  }
}

/** Reclaim events stuck in PEL after a worker crash (idle > claimMinIdleMs). */
export async function claimStalePendingEvents(
  minIdleMs = workerConfig.claimMinIdleMs
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
      workerConfig.streamReadCount
    )) as [string, [string, string[]][], string[]];
    const messages = result[1] ?? [];
    return parseStreamMessages(messages);
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return [];
  }
}

/** Lecture immédiate (sans attente) des nouveaux événements du stream. */
export async function readGroupEventsImmediate(): Promise<
  { id: string; event: import("@sondage/shared").VoteSubmittedEvent }[]
> {
  const r = getRedis();
  try {
    return await readGroupEventsOnce(r, ">");
  } catch (err) {
    if (!isMissingConsumerGroupError(err)) throw err;
    await ensureConsumerGroup();
    return readGroupEventsOnce(r, ">");
  }
}

export async function ackEvent(id: string): Promise<void> {
  await getRedis().xack(
    workerConfig.voteEventsStream,
    workerConfig.consumerGroup,
    id
  );
}

/**
 * Retire du stream les entrées déjà livrées et ackées par le consumer group.
 * Ne supprime jamais les messages encore dans le PEL ni ceux non lus (lag).
 */
export async function trimProcessedVoteEvents(): Promise<number> {
  if (!workerConfig.voteStreamTrimEnabled) {
    return 0;
  }

  const r = getRedis();
  const stream = workerConfig.voteEventsStream;
  const group = workerConfig.consumerGroup;

  try {
    const [pendingSummary, groups] = await Promise.all([
      r.xpending(stream, group) as Promise<[number, string, string, unknown[]]>,
      r.xinfo("GROUPS", stream),
    ]);

    const pelCount = Number(pendingSummary?.[0] ?? 0);
    let minId: string | null = null;

    if (pelCount > 0) {
      const oldest = (await r.xpending(
        stream,
        group,
        "-",
        "+",
        1
      )) as [string, string, number, number][] | null;
      minId = oldest?.[0]?.[0] ?? null;
    } else {
      minId = parseConsumerGroupInfo(groups, group)?.lastDeliveredId ?? null;
    }

    if (!minId) {
      return 0;
    }

    return await r.xtrim(stream, "MINID", "~", minId);
  } catch (err) {
    if (isMissingConsumerGroupError(err)) {
      return 0;
    }
    throw err;
  }
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
