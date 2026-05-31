/** Isolation Redis pour les tests d'intégration (évite collision avec un worker local). */
const redisBase = process.env.REDIS_URL ?? "redis://localhost:6379";
if (!redisBase.match(/\/\d+$/)) {
  process.env.REDIS_URL = `${redisBase.replace(/\/$/, "")}/15`;
}
