import { defineConfig } from "drizzle-kit";

// Config for `pnpm db:generate` (drizzle-kit) — generates migration SQL from
// src/db/schema.ts into ./drizzle, which src/db/client.ts applies on boot via
// drizzle-orm's better-sqlite3 migrator. dbCredentials.url is only used by
// drizzle-kit's own tooling (e.g. `drizzle-kit studio`); the app itself reads
// DATABASE_URL directly (see src/db/client.ts).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./dev.db",
  },
});
