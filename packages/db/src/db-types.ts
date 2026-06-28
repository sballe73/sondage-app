import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema.js";

export type AppDb = PostgresJsDatabase<typeof schema>;
export type DbTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
