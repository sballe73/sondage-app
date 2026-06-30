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
  /** Max événements agrégés par tick (évite un tick bloqué des heures). */
  maxEventsPerTick: Number(process.env.WORKER_MAX_EVENTS_PER_TICK ?? 500),
  /** Délai min (ms) avant XAUTOCLAIM sur le PEL d'un autre consumer (crash). */
  claimMinIdleMs: Number(process.env.WORKER_CLAIM_MIN_IDLE_MS ?? 5_000),
  /** Supprime du stream les événements déjà ackés (XTRIM MINID). */
  voteStreamTrimEnabled: process.env.VOTE_STREAM_TRIM_ENABLED !== "false",
};
