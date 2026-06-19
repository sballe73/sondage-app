import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseUrl } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `src/migrate.ts` → src/migrations ; `dist/migrate.js` → src/migrations (SQL not copied by tsc). */
function migrationsDir(): string {
  const nextToModule = join(__dirname, "migrations");
  if (existsSync(nextToModule)) return nextToModule;
  const inSrc = join(__dirname, "..", "src", "migrations");
  if (existsSync(inSrc)) return inSrc;
  throw new Error(`Migrations directory not found (looked in ${nextToModule}, ${inSrc})`);
}

const sql = postgres(getDatabaseUrl(), { max: 1 });
const dir = migrationsDir();

for (const file of [
  "001_init.sql",
  "002_grade_labels.sql",
  "003_mock_snapshot_every_vote.sql",
  "004_vote_platform.sql",
]) {
  const migration = readFileSync(join(dir, file), "utf8");
  await sql.unsafe(migration);
  console.log(`Migration ${file} applied`);
}
await sql.end();
