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
};
