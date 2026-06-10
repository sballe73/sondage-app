import { join } from "node:path";
import {
  assertComplianceOrThrow,
  complianceEnvFromProcess,
  loadComplianceContext,
} from "@sondage/shared";

const ROOT = join(import.meta.dirname, "../../..");

export function assertStartupCompliance(): void {
  const env = complianceEnvFromProcess();
  const ctx = loadComplianceContext(ROOT);
  assertComplianceOrThrow(env, ctx);
}
