import type { VoteSubmittedEvent } from "@sondage/shared";
import { getRedis } from "./redis.js";
import { config } from "./config.js";

export async function publishVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  const redis = getRedis();
  await redis.xadd(
    config.voteEventsStream,
    "*",
    "payload",
    JSON.stringify(event)
  );
}

export async function readVoteEvents(
  lastId: string,
  count = 10
): Promise<{ id: string; event: VoteSubmittedEvent }[]> {
  const redis = getRedis();
  const rows = await redis.xread(
    "COUNT",
    count,
    "STREAMS",
    config.voteEventsStream,
    lastId
  );
  if (!rows) return [];
  const [, messages] = rows[0] as [string, [string, string[]][]];
  return messages.map(([id, fields]) => {
    const payloadIdx = fields.indexOf("payload");
    const payload = fields[payloadIdx + 1] ?? "{}";
    return { id, event: JSON.parse(payload) as VoteSubmittedEvent };
  });
}
