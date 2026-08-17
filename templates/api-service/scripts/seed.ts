import { createDb } from "../src/db/client.js";
import { items } from "../src/db/schema.js";

// `pnpm db:seed` (PV-006) — proves the DATABASE_URL path is real by writing
// through it, not just reading it back.
const db = createDb();
const seedNames = ["Sample widget", "Sample gadget"];

for (const name of seedNames) {
  db.insert(items).values({ name }).run();
}

console.log(`Seeded ${seedNames.length} items into ${process.env.DATABASE_URL ?? "file:./dev.db"}`);
