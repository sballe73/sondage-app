/**
 * Stockage session OAuth par plateforme (pas par sondage).
 * Permet de conserver la connexion Facebook/Google/etc. entre sondages.
 */
(function () {
  const TOKEN_PREFIX = "sondage_token_";
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function tokenKey(platform) {
    return TOKEN_PREFIX + platform;
  }

  function isLegacyPollKey(storageKey) {
    if (!storageKey || !storageKey.startsWith(TOKEN_PREFIX)) return false;
    return UUID_RE.test(storageKey.slice(TOKEN_PREFIX.length));
  }

  function readToken(platform) {
    if (!platform) return null;
    return sessionStorage.getItem(tokenKey(platform));
  }

  function writeToken(platform, token) {
    if (!platform || !token) return;
    sessionStorage.setItem(tokenKey(platform), token);
  }

  function clearToken(platform) {
    if (platform) {
      sessionStorage.removeItem(tokenKey(platform));
      return;
    }
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(TOKEN_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  }

  /** Migre un jeton encore indexé par pollId (ancien format). */
  function migrateLegacyPollToken(pollId, platform) {
    if (!pollId || !platform) return null;
    const legacyKey = TOKEN_PREFIX + pollId;
    const legacy = sessionStorage.getItem(legacyKey);
    if (!legacy) return null;
    writeToken(platform, legacy);
    sessionStorage.removeItem(legacyKey);
    return legacy;
  }

  /** Retourne un jeton encore stocké sous une clé pollId (autre sondage). */
  function findAnyLegacyToken() {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !isLegacyPollKey(k)) continue;
      const token = sessionStorage.getItem(k);
      if (token) return { token, legacyKey: k };
    }
    return null;
  }

  function clearLegacyKey(legacyKey) {
    if (legacyKey) sessionStorage.removeItem(legacyKey);
  }

  window.SondageAuthStorage = {
    tokenKey,
    readToken,
    writeToken,
    clearToken,
    migrateLegacyPollToken,
    findAnyLegacyToken,
    clearLegacyKey,
    isLegacyPollKey,
  };
})();
