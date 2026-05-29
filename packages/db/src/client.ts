import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let sql: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgres://sondage:sondage@localhost:5432/sondage"
  );
}

export function getDb() {
  if (!db) {
    sql = postgres(getDatabaseUrl(), {
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    db = drizzle(sql, { schema });
  }
  return db;
}

export async function closeDb() {
  if (!sql) return;
  const pool = sql;
  sql = null;
  db = null;
  await pool.end({ timeout: 5 });
}

export { schema };
