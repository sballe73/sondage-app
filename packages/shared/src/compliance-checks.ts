import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseEnabledPlatforms,
  REAL_OAUTH_PLATFORMS,
  isRealOAuthPlatform,
} from "./platforms.js";
import { PLATFORMS, type Platform } from "./types.js";

export type ComplianceMode = "prototype" | "production";

export type ComplianceCheckResult = {
  id: string;
  ok: boolean;
  message: string;
  severity: "error" | "warning";
};

export const DEV_JWT_SECRETS = new Set([
  "dev-secret-change-in-production",
  "change-me-in-production",
]);

export const DEV_HASH_SALTS = new Set([
  "dev-salt",
  "change-me-for-anonymous-polls",
]);

export interface ComplianceEnv {
  complianceMode: ComplianceMode;
  jwtSecret: string;
  participationHashSalt: string;
  defaultDataRegion: string;
  publicBaseUrl: string;
  renderExternalUrl?: string;
  rateLimitEnabled: boolean;
  enabledPlatformsRaw?: string;
  logPii: boolean;
  gdprManualAttestationVersion?: string;
  oauthFacebookAppId: string;
  oauthFacebookAppSecret: string;
  oauthGoogleClientId: string;
  oauthGoogleClientSecret: string;
}

export interface ComplianceContext {
  rootDir: string;
  checklistVersion: string;
  manualAttestationVersion: string;
}

export function parseComplianceMode(raw: string | undefined): ComplianceMode {
  const mode = raw?.trim().toLowerCase();
  if (!mode || mode === "prototype") return "prototype";
  if (mode === "production") return "production";
  throw new Error(
    `Invalid COMPLIANCE_MODE: ${raw} (expected prototype or production)`
  );
}

export function loadComplianceContext(rootDir: string): ComplianceContext {
  const checklistPath = join(rootDir, "compliance/gdpr-checklist.json");
  if (!existsSync(checklistPath)) {
    throw new Error(`Missing compliance checklist: ${checklistPath}`);
  }
  const checklist = JSON.parse(readFileSync(checklistPath, "utf8")) as {
    version: string;
    manualAttestationVersion: string;
  };
  return {
    rootDir,
    checklistVersion: checklist.version,
    manualAttestationVersion: checklist.manualAttestationVersion,
  };
}

function effectivePublicUrl(env: ComplianceEnv): string {
  return (env.publicBaseUrl || env.renderExternalUrl || "").replace(/\/$/, "");
}

function enabledPlatforms(env: ComplianceEnv): Platform[] {
  return parseEnabledPlatforms(env.enabledPlatformsRaw);
}

function isFacebookConfigured(env: ComplianceEnv): boolean {
  return Boolean(env.oauthFacebookAppId && env.oauthFacebookAppSecret);
}

function isGoogleConfigured(env: ComplianceEnv): boolean {
  return Boolean(env.oauthGoogleClientId && env.oauthGoogleClientSecret);
}

function isOAuthConfigured(platform: Platform, env: ComplianceEnv): boolean {
  if (platform === "facebook") return isFacebookConfigured(env);
  if (platform === "google") return isGoogleConfigured(env);
  return false;
}

export function runComplianceChecks(
  env: ComplianceEnv,
  ctx: ComplianceContext
): ComplianceCheckResult[] {
  const results: ComplianceCheckResult[] = [];
  const mode = env.complianceMode;
  const severity = mode === "production" ? "error" : "warning";
  const platforms = enabledPlatforms(env);

  results.push({
    id: "enabled_platforms_no_mock",
    ok: !platforms.includes("mock"),
    message: platforms.includes("mock")
      ? "mock must not appear in ENABLED_PLATFORMS for production"
      : "mock is not in ENABLED_PLATFORMS",
    severity,
  });

  const oauthMissing = platforms.filter(
    (p) => isRealOAuthPlatform(p) && !isOAuthConfigured(p, env)
  );
  results.push({
    id: "oauth_credentials",
    ok: oauthMissing.length === 0,
    message:
      oauthMissing.length === 0
        ? "OAuth credentials configured for enabled platforms"
        : `Missing OAuth credentials for: ${oauthMissing.join(", ")}`,
    severity,
  });

  const hasRealOAuth = platforms.some(
    (p) => isRealOAuthPlatform(p) && isOAuthConfigured(p, env)
  );
  results.push({
    id: "real_oauth_platform",
    ok: hasRealOAuth,
    message: hasRealOAuth
      ? "At least one real OAuth platform is enabled"
      : "No real OAuth platform enabled with credentials",
    severity,
  });

  const jwtOk =
    Boolean(env.jwtSecret) && !DEV_JWT_SECRETS.has(env.jwtSecret);
  results.push({
    id: "jwt_secret",
    ok: jwtOk,
    message: jwtOk
      ? "JWT_SECRET is set to a non-default value"
      : "JWT_SECRET is missing or uses a dev default",
    severity,
  });

  const saltOk =
    Boolean(env.participationHashSalt) &&
    !DEV_HASH_SALTS.has(env.participationHashSalt);
  results.push({
    id: "participation_hash_salt",
    ok: saltOk,
    message: saltOk
      ? "PARTICIPATION_HASH_SALT is set to a non-default value"
      : "PARTICIPATION_HASH_SALT is missing or uses a dev default",
    severity,
  });

  results.push({
    id: "data_region_eu",
    ok: env.defaultDataRegion === "EU",
    message:
      env.defaultDataRegion === "EU"
        ? "DEFAULT_DATA_REGION is EU"
        : `DEFAULT_DATA_REGION must be EU (got ${env.defaultDataRegion})`,
    severity,
  });

  const publicUrl = effectivePublicUrl(env);
  const httpsOk = publicUrl.startsWith("https://");
  results.push({
    id: "https_public_url",
    ok: httpsOk,
    message: httpsOk
      ? `Public URL is HTTPS (${publicUrl})`
      : `Public URL must be HTTPS (got ${publicUrl || "(empty)"})`,
    severity,
  });

  results.push({
    id: "rate_limit_enabled",
    ok: env.rateLimitEnabled,
    message: env.rateLimitEnabled
      ? "Rate limiting is enabled"
      : "RATE_LIMIT_ENABLED must not be false in production",
    severity,
  });

  const legalFiles = ["privacy.html", "terms.html", "data-deletion.html"];
  const missingLegal = legalFiles.filter(
    (f) => !existsSync(join(ctx.rootDir, "embed/legal", f))
  );
  results.push({
    id: "legal_pages",
    ok: missingLegal.length === 0,
    message:
      missingLegal.length === 0
        ? "Legal pages exist under embed/legal/"
        : `Missing legal pages: ${missingLegal.join(", ")}`,
    severity: "error",
  });

  const facebookProviderPath = join(
    ctx.rootDir,
    "apps/api/src/auth/providers/facebook.ts"
  );
  let facebookScopeOk = false;
  if (existsSync(facebookProviderPath)) {
    const src = readFileSync(facebookProviderPath, "utf8");
    facebookScopeOk =
      /FB_SCOPES\s*=\s*"public_profile"/.test(src) &&
      !src.includes("user_location") &&
      !src.includes("user_age_range");
  }
  results.push({
    id: "facebook_scope_minimal",
    ok: facebookScopeOk,
    message: facebookScopeOk
      ? "Facebook OAuth scope is public_profile only"
      : "Facebook provider must request public_profile scope only",
    severity,
  });

  const deletionHandlerPath = join(
    ctx.rootDir,
    "apps/api/src/auth/facebook-data-deletion.ts"
  );
  let purgeOk = false;
  if (existsSync(deletionHandlerPath)) {
    const src = readFileSync(deletionHandlerPath, "utf8");
    purgeOk = src.includes("purgeUserData") || src.includes("deleteUserVoteData");
  }
  results.push({
    id: "data_deletion_purge",
    ok: purgeOk,
    message: purgeOk
      ? "Meta data deletion callback triggers user data purge"
      : "facebook-data-deletion.ts must invoke user data purge",
    severity,
  });

  results.push({
    id: "log_pii_disabled",
    ok: !env.logPii,
    message: env.logPii
      ? "LOG_PII must not be true in production"
      : "PII logging is disabled",
    severity,
  });

  const attestationOk =
    env.gdprManualAttestationVersion === ctx.manualAttestationVersion;
  results.push({
    id: "manual_attestation",
    ok: attestationOk,
    message: attestationOk
      ? `Manual attestation version matches (${ctx.manualAttestationVersion})`
      : `Set GDPR_MANUAL_ATTESTATION_VERSION=${ctx.manualAttestationVersion} after manual review`,
    severity,
  });

  return results;
}

export function complianceEnvFromProcess(
  env: NodeJS.ProcessEnv = process.env
): ComplianceEnv {
  return {
    complianceMode: parseComplianceMode(env.COMPLIANCE_MODE),
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-in-production",
    participationHashSalt:
      env.PARTICIPATION_HASH_SALT ?? "dev-salt",
    defaultDataRegion: env.DEFAULT_DATA_REGION ?? "EU",
    publicBaseUrl: env.PUBLIC_BASE_URL ?? "",
    renderExternalUrl: env.RENDER_EXTERNAL_URL,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED !== "false",
    enabledPlatformsRaw: env.ENABLED_PLATFORMS,
    logPii: env.LOG_PII === "true",
    gdprManualAttestationVersion: env.GDPR_MANUAL_ATTESTATION_VERSION,
    oauthFacebookAppId: env.OAUTH_FACEBOOK_APP_ID ?? "",
    oauthFacebookAppSecret: env.OAUTH_FACEBOOK_APP_SECRET ?? "",
    oauthGoogleClientId: env.OAUTH_GOOGLE_CLIENT_ID ?? "",
    oauthGoogleClientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET ?? "",
  };
}

export function formatComplianceReport(
  results: ComplianceCheckResult[],
  mode: ComplianceMode
): string {
  const lines = [`Compliance check (mode=${mode})`];
  for (const r of results) {
    const icon = r.ok ? "OK" : r.severity === "error" ? "FAIL" : "WARN";
    lines.push(`  [${icon}] ${r.id}: ${r.message}`);
  }
  return lines.join("\n");
}

export function assertComplianceOrThrow(
  env: ComplianceEnv,
  ctx: ComplianceContext
): void {
  const results = runComplianceChecks(env, ctx);
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) return;

  if (env.complianceMode === "prototype") {
    console.warn(formatComplianceReport(results, env.complianceMode));
    return;
  }

  const errors = failures.filter((r) => r.severity === "error");
  if (errors.length > 0) {
    throw new Error(formatComplianceReport(results, env.complianceMode));
  }
}

/** Plateformes utilisables sur cette instance (enabled + opérationnelles). */
export function resolveUsablePlatforms(env: {
  enabledPlatforms: readonly Platform[];
  isOAuthConfigured: (platform: Platform) => boolean;
}): Platform[] {
  return env.enabledPlatforms.filter((platform) => {
    if (platform === "mock") return true;
    if (isRealOAuthPlatform(platform)) {
      return env.isOAuthConfigured(platform);
    }
    return false;
  });
}

export { PLATFORMS, REAL_OAUTH_PLATFORMS };
