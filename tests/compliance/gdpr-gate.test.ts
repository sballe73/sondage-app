/**
 * Garde-fou compliance — vérifie que le script check:compliance fonctionne.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

describe("GDPR production gate script", () => {
  it("check:compliance exits 0 in prototype mode with dev env", () => {
    execSync("npm run check:compliance", {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        COMPLIANCE_MODE: "prototype",
        MOCK_OAUTH: "true",
      },
    });
  });

  it("check:compliance exits 1 in production mode without attestation", () => {
    assert.throws(
      () =>
        execSync("npm run check:compliance", {
          cwd: ROOT,
          stdio: "pipe",
          env: {
            ...process.env,
            COMPLIANCE_MODE: "production",
            MOCK_OAUTH: "false",
            JWT_SECRET: "prod-secret-value-32chars-minimum!!",
            PARTICIPATION_HASH_SALT: "prod-salt-value-32chars-minimum!!",
            DEFAULT_DATA_REGION: "EU",
            PUBLIC_BASE_URL: "https://sondage.example.com",
            RATE_LIMIT_ENABLED: "true",
            ENABLED_PLATFORMS: "facebook",
            LOG_PII: "false",
            OAUTH_FACEBOOK_APP_ID: "fb-app-id",
            OAUTH_FACEBOOK_APP_SECRET: "fb-app-secret",
          },
        }),
      (err: NodeJS.ErrnoException) => err.status !== 0
    );
  });

  it("check:compliance passes in production mode with full env", () => {
    execSync("npm run check:compliance", {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        COMPLIANCE_MODE: "production",
        MOCK_OAUTH: "false",
        JWT_SECRET: "prod-secret-value-32chars-minimum!!",
        PARTICIPATION_HASH_SALT: "prod-salt-value-32chars-minimum!!",
        DEFAULT_DATA_REGION: "EU",
        PUBLIC_BASE_URL: "https://sondage.example.com",
        RATE_LIMIT_ENABLED: "true",
        ENABLED_PLATFORMS: "facebook",
        LOG_PII: "false",
        GDPR_MANUAL_ATTESTATION_VERSION: "2026-06-09",
        OAUTH_FACEBOOK_APP_ID: "fb-app-id",
        OAUTH_FACEBOOK_APP_SECRET: "fb-app-secret",
      },
    });
  });
});
