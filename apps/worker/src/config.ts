export const workerConfig = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  voteEventsStream: process.env.VOTE_EVENTS_STREAM ?? "vote:events",
  consumerGroup: "aggregators",
  consumerName: process.env.HOSTNAME ?? `worker-${process.pid}`,
  blockMs: 5000,
  batchSize: 10,
};
