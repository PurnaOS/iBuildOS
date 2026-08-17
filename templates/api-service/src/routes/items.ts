import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { items } from "../db/schema.js";

/** A small CRUD-ish surface over the `items` table — real reads/writes
 * through Drizzle, no framework magic, enough to prove the DB path works. */
export function registerItemsRoutes(app: Hono, db: DbClient): void {
  app.get("/items", async (c) => {
    const rows = await db.select().from(items);
    return c.json({ items: rows });
  });

  app.post("/items", async (c) => {
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return c.json({ error: "name is required" }, 400);
    }
    const [created] = await db.insert(items).values({ name }).returning();
    return c.json({ item: created }, 201);
  });

  app.get("/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "id must be an integer" }, 400);
    }
    const [found] = await db.select().from(items).where(eq(items.id, id));
    if (!found) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json({ item: found });
  });
}
