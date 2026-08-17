import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/db/client.ts -> ../../drizzle, and dist/db/client.js -> ../../drizzle:
// both sit two directories below the project root, so the relative path
// resolves the same way whether run via tsx (from src) or node (from dist).
const migrationsFolder = path.resolve(here, "../../drizzle");

export type DbClient = BetterSQLite3Database;

/** Strips a "file:" scheme prefix (FORMATS §7's DATABASE_URL convention) down
 * to the plain path better-sqlite3 expects; "file::memory:" becomes the
 * driver's special in-memory identifier ":memory:". */
export function resolveDatabasePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
}

/** Opens (creating if needed) the SQLite database at DATABASE_URL and applies
 * any pending Drizzle migrations before returning — dev, test, and seed all
 * go through this so the schema is never stale. */
export function createDb(databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db"): DbClient {
  const sqlite = new Database(resolveDatabasePath(databaseUrl));
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  return db;
}
