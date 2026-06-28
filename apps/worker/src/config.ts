/** Nombre d'événements lus par appel Redis (interne, pas une « tranche » utilisateur). */
const STREAM_READ_COUNT = 100;

export const workerConfig = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  voteEventsStream: process.env.VOTE_EVENTS_STREAM ?? "vote:events",
  consumerGroup: "aggregators",
  consumerName: process.env.HOSTNAME ?? `worker-${process.pid}`,
  /** Intervalle entre deux vérifications de nouveaux votes (défaut : 1 min). */
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 60_000),
  streamReadCount: STREAM_READ_COUNT,
};
