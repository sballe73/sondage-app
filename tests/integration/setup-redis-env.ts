/** Isolation Redis + env de test pour les tests d'intégration. */
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-chars!!";
process.env.PARTICIPATION_HASH_SALT ??= "integration-test-hash-salt";
process.env.COMPLIANCE_MODE ??= "prototype";
process.env.SNAPSHOT_MIN_INTERVAL_MS ??= "0";
process.env.ENABLED_PLATFORMS ??= "mock,facebook,google";
process.env.OAUTH_FACEBOOK_APP_ID ??= "integration-test-fb-app-id";
process.env.OAUTH_FACEBOOK_APP_SECRET ??= "integration-test-fb-secret";
process.env.OAUTH_GOOGLE_CLIENT_ID ??= "integration-test-google-client-id";
process.env.OAUTH_GOOGLE_CLIENT_SECRET ??= "integration-test-google-client-secret";

const redisBase = process.env.REDIS_URL ?? "redis://localhost:6379";
if (!redisBase.match(/\/\d+$/)) {
  process.env.REDIS_URL = `${redisBase.replace(/\/$/, "")}/15`;
}
