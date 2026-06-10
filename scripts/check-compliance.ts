#!/usr/bin/env tsx
/**
 * Vérifie la conformité RGPD / production.
 * COMPLIANCE_MODE=prototype (défaut) → warnings ; production → exit 1 si échec.
 */
import { join } from "node:path";
import {
  assertComplianceOrThrow,
  complianceEnvFromProcess,
  formatComplianceReport,
  loadComplianceContext,
  runComplianceChecks,
} from "@sondage/shared";

const ROOT = join(import.meta.dirname, "..");
const env = complianceEnvFromProcess();
const ctx = loadComplianceContext(ROOT);
const results = runComplianceChecks(env, ctx);
const failures = results.filter((r) => !r.ok);

console.log(formatComplianceReport(results, env.complianceMode));

if (failures.length === 0) {
  process.exit(0);
}

if (env.complianceMode === "prototype") {
  console.warn(
    `\n${failures.length} compliance issue(s) — prototype mode, continuing with warnings.`
  );
  process.exit(0);
}

try {
  assertComplianceOrThrow(env, ctx);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
