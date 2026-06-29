/** Délai minimum entre deux publications de snapshot pour un même sondage. */
export const DEFAULT_SNAPSHOT_MIN_INTERVAL_MS = 60_000;

export function parseSnapshotMinIntervalMs(
  raw: string | undefined
): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_SNAPSHOT_MIN_INTERVAL_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return DEFAULT_SNAPSHOT_MIN_INTERVAL_MS;
  }
  return n;
}

/** Millisecondes restantes avant la prochaine publication autorisée (0 = pas de throttle). */
export function snapshotThrottleRemainingMs(
  lastComputedAt: Date | string | null | undefined,
  now: Date,
  minIntervalMs: number
): number {
  if (minIntervalMs <= 0 || !lastComputedAt) {
    return 0;
  }
  const elapsed = now.getTime() - new Date(lastComputedAt).getTime();
  if (elapsed >= minIntervalMs) {
    return 0;
  }
  return minIntervalMs - elapsed;
}
