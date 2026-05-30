/** CORS : absent ou `*` → tout autoriser (dev). Sinon liste séparée par des virgules. */
export function parseCorsOrigins(
  raw: string | undefined
): boolean | string[] {
  const value = raw?.trim();
  if (!value || value === "*") return true;
  const origins = value.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : true;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  jwtIssuer: "sondage-app",
  jwtAudience: "sondage-voters",
  defaultDataRegion: (process.env.DEFAULT_DATA_REGION ?? "EU") as
    | "EU"
    | "US"
    | "GLOBAL",
  regionHeader: "x-data-region",
  voteEventsStream: "vote:events",
  mockOAuthEnabled: process.env.MOCK_OAUTH !== "false",
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
  rateLimitGlobalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 100),
  rateLimitGlobalWindowMs: Number(
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? 60_000
  ),
  rateLimitVotesPerMinute: Number(
    process.env.RATE_LIMIT_VOTES_PER_MINUTE ?? 5
  ),
};
