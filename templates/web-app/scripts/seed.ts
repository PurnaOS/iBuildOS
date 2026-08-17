import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { tasks } from "../db/schema";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url });
  const db = drizzle(client);

  await db.insert(tasks).values([
    { title: "Set up the project", done: true },
    { title: "Wire up Drizzle + SQLite", done: true },
    { title: "Ship your first feature", done: false },
  ]);
  console.log(`Seeded 3 example tasks into ${url}`);

  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
