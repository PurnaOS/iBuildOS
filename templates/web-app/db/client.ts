import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Opened lazily, on first use, rather than at module load time — importing
// this module (e.g. transitively, during `next build`'s route/page
// discovery) must never touch the filesystem or open a DB connection.
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!dbInstance) {
    const url = process.env.DATABASE_URL ?? "file:./local.db";
    const client = createClient({ url });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}
