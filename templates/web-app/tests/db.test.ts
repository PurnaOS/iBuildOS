import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { tasks } from "../db/schema";

// A pure unit test against an in-memory SQLite database — no Next.js, no
// dev server. It applies the real drizzle/ migration (proving `db:migrate`
// is genuine, not just declared) and then exercises the same schema the app
// and the seed script use.
describe("drizzle + sqlite", () => {
  it("migrates, inserts, and reads a task", async () => {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client);

    await migrate(db, { migrationsFolder: "./drizzle" });

    await db.insert(tasks).values({ title: "write a test", done: false });
    const rows = await db.select().from(tasks);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("write a test");
    expect(rows[0]?.done).toBe(false);

    client.close();
  });

  it("supports multiple rows and the done flag", async () => {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client);

    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(tasks).values([
      { title: "a", done: true },
      { title: "b", done: false },
    ]);

    const rows = await db.select().from(tasks);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.done)).toHaveLength(1);

    client.close();
  });
});
