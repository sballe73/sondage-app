/** CORS : absent ou `*` → tout autoriser (dev). Sinon liste séparée par des virgules. */
export function parseCorsOrigins(
  raw: string | undefined
): boolean | string[] {
  const value = raw?.trim();
  if (!value || value === "*") return true;
  const origins = value.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : true;
}

export const DEV_JWT_SECRETS = [
  "dev-secret-change-in-production",
  "change-me-in-production",
] as const;

export const DEV_HASH_SALTS = ["dev-salt", "change-me-for-anonymous-polls"] as const;

const port = Number(process.env.PORT ?? 3000);

import { parseEnabledPlatforms } from "@sondage/shared";

export const config = {
  port,
  host: process.env.HOST ?? "0.0.0.0",
  /** URL publique de l’API (redirect OAuth, liens embed). */
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    `http://localhost:${port}`
  ).replace(/\/$/, ""),
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
  enabledPlatforms: parseEnabledPlatforms(process.env.ENABLED_PLATFORMS),
  participationHashSalt:
    process.env.PARTICIPATION_HASH_SALT ?? "dev-salt",
  logPii: process.env.LOG_PII === "true",
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
  rateLimitGlobalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 100),
  rateLimitGlobalWindowMs: Number(
    process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? 60_000
  ),
  rateLimitVotesPerMinute: Number(
    process.env.RATE_LIMIT_VOTES_PER_MINUTE ?? 5
  ),
  oauthGoogleClientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? "",
  oauthGoogleClientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "",
  oauthGoogleRedirectUri:
    process.env.OAUTH_GOOGLE_REDIRECT_URI ??
    `${(process.env.PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`).replace(/\/$/, "")}/auth/google/callback`,
  oauthFacebookAppId: process.env.OAUTH_FACEBOOK_APP_ID ?? "",
  oauthFacebookAppSecret: process.env.OAUTH_FACEBOOK_APP_SECRET ?? "",
  oauthFacebookRedirectUri:
    process.env.OAUTH_FACEBOOK_REDIRECT_URI ??
    `${(process.env.PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`).replace(/\/$/, "")}/auth/facebook/callback`,
  /** URL de suivi renvoyée à Meta après une demande de suppression (callback). */
  metaDataDeletionStatusUrl: process.env.META_DATA_DELETION_STATUS_URL,
};

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    config.oauthGoogleClientId &&
      config.oauthGoogleClientSecret &&
      config.oauthGoogleRedirectUri
  );
}

export function isFacebookOAuthConfigured(): boolean {
  return Boolean(
    config.oauthFacebookAppId &&
      config.oauthFacebookAppSecret &&
      config.oauthFacebookRedirectUri
  );
}
