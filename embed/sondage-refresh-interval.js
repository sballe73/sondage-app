/**
 * Intervalle de rafraîchissement aligné sur SNAPSHOT_MIN_INTERVAL_MS (API /health).
 */
(function () {
  const DEFAULT_MS = 60_000;

  function pollMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_MS;
    return n;
  }

  function fromHealth(health) {
    return pollMs(health?.snapshotMinIntervalMs);
  }

  function fromResultsMeta(meta) {
    return pollMs(meta?.snapshotMinIntervalMs ?? meta?.aggregationIntervalMs);
  }

  /** Libellé pour l’UI : toujours en secondes (ex. « 60 secondes »). */
  function formatSecondsLabel(ms) {
    const sec = Math.max(1, Math.round(pollMs(ms) / 1000));
    return `${sec} seconde${sec > 1 ? "s" : ""}`;
  }

  window.SondageRefreshInterval = {
    DEFAULT_MS,
    pollMs,
    fromHealth,
    fromResultsMeta,
    formatSecondsLabel,
  };
})();
