import postgres from "postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseUrl } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(getDatabaseUrl(), { max: 1 });

for (const file of ["001_init.sql", "002_grade_labels.sql"]) {
  const migration = readFileSync(
    join(__dirname, "migrations", file),
    "utf8"
  );
  await sql.unsafe(migration);
  console.log(`Migration ${file} applied`);
}
await sql.end();
