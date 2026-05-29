import type { VoteSubmittedEvent } from "@sondage/shared";
import { closeDb } from "@sondage/db";
import { workerConfig } from "./config.js";
import {
  ensureConsumerGroup,
  readGroupEvents,
  ackEvent,
  closeRedis,
} from "./redis.js";
import { processVoteEvent } from "./processor.js";

console.log(`Worker ${workerConfig.consumerName} starting...`);

await ensureConsumerGroup();

const loop = async () => {
  const batch = await readGroupEvents();
  for (const { id, event } of batch) {
    try {
      await processVoteEvent(event);
      await ackEvent(id);
    } catch (err) {
      console.error(`Failed event ${id}:`, err);
    }
  }
};

const interval = setInterval(() => {
  loop().catch((e) => console.error("Loop error:", e));
}, 100);

process.on("SIGINT", async () => {
  clearInterval(interval);
  await closeRedis();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearInterval(interval);
  await closeRedis();
  await closeDb();
  process.exit(0);
});
