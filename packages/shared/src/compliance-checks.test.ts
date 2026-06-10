import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  runComplianceChecks,
  complianceEnvFromProcess,
  loadComplianceContext,
  parseComplianceMode,
} from "./compliance-checks.js";

const ROOT = join(import.meta.dirname, "../../..");

function productionEnv(overrides: Record<string, string> = {}) {
  return complianceEnvFromProcess({
    COMPLIANCE_MODE: "production",
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
    ...overrides,
  });
}

describe("compliance checks", () => {
  const ctx = loadComplianceContext(ROOT);

  it("parseComplianceMode defaults to prototype", () => {
    assert.equal(parseComplianceMode(undefined), "prototype");
    assert.equal(parseComplianceMode("prototype"), "prototype");
    assert.equal(parseComplianceMode("production"), "production");
  });

  it("production env passes when fully configured", () => {
    const results = runComplianceChecks(productionEnv(), ctx);
    const failures = results.filter((r) => !r.ok);
    assert.equal(
      failures.length,
      0,
      failures.map((f) => `${f.id}: ${f.message}`).join("\n")
    );
  });

  it("fails when mock is in ENABLED_PLATFORMS", () => {
    const results = runComplianceChecks(
      productionEnv({ ENABLED_PLATFORMS: "facebook,mock" }),
      ctx
    );
    const item = results.find((r) => r.id === "enabled_platforms_no_mock");
    assert.ok(item);
    assert.equal(item!.ok, false);
  });

  it("fails when JWT_SECRET is dev default", () => {
    const results = runComplianceChecks(
      productionEnv({ JWT_SECRET: "dev-secret-change-in-production" }),
      ctx
    );
    const item = results.find((r) => r.id === "jwt_secret");
    assert.ok(item);
    assert.equal(item!.ok, false);
  });

  it("fails without manual attestation", () => {
    const results = runComplianceChecks(
      productionEnv({ GDPR_MANUAL_ATTESTATION_VERSION: undefined }),
      ctx
    );
    const item = results.find((r) => r.id === "manual_attestation");
    assert.ok(item);
    assert.equal(item!.ok, false);
  });
});
