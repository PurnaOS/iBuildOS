import { Hono } from "hono";
import { createDb, type DbClient } from "./db/client.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerItemsRoutes } from "./routes/items.js";

/** Builds the Hono app. Accepts an optional db client so tests can inject an
 * isolated in-memory database instead of touching the dev file. */
export function createApp(db: DbClient = createDb()): Hono {
  const app = new Hono();
  registerHealthRoutes(app);
  registerItemsRoutes(app, db);
  return app;
}
