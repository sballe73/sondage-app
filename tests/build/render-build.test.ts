/**
 * Vérifie que le build de production (comme Render) réussit depuis un état propre.
 * Détecte les imports inter-workspaces invalides (ex. API → worker non compilé).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

const DEPLOY_SCRIPTS = [
  "scripts/render-start-api.sh",
  "scripts/run-worker-dev.sh",
  "scripts/run-worker-prod.sh",
];

const DIST_DIRS = [
  "packages/shared/dist",
  "packages/db/dist",
  "apps/worker/dist",
  "apps/api/dist",
];

const REQUIRED_DIST_ARTIFACTS = [
  "packages/shared/dist/index.js",
  "packages/db/dist/index.js",
  "apps/worker/dist/worker.js",
  "apps/api/dist/server.js",
];

function cleanDist(): void {
  for (const dir of DIST_DIRS) {
    const full = join(ROOT, dir);
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
    }
  }
}

describe("Render production build", () => {
  it("api does not depend on @sondage/worker (tsc build order)", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "apps/api/package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    assert.equal(
      pkg.dependencies?.["@sondage/worker"],
      undefined,
      "API must not import worker; share logic via @sondage/db instead"
    );
  });

  it("deploy shell scripts exist and are executable", () => {
    for (const rel of DEPLOY_SCRIPTS) {
      const path = join(ROOT, rel);
      assert.ok(existsSync(path), `expected ${rel}`);
      const mode = statSync(path).mode & 0o111;
      assert.ok(mode !== 0, `${rel} should be executable`);
    }
  });

  it("npm run build succeeds from a clean dist (like Render deploy)", () => {
    cleanDist();

    for (const dir of DIST_DIRS) {
      assert.equal(
        existsSync(join(ROOT, dir)),
        false,
        `precondition: ${dir} should be absent before build`
      );
    }

    execSync("npm run build", {
      cwd: ROOT,
      stdio: "pipe",
      env: process.env,
    });

    for (const artifact of REQUIRED_DIST_ARTIFACTS) {
      assert.ok(
        existsSync(join(ROOT, artifact)),
        `expected build artifact ${artifact}`
      );
    }
  });
});
