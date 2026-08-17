import { createDb } from "../src/db/client.js";

// `pnpm db:migrate` — createDb() applies pending Drizzle migrations as a side
// effect of opening the connection, so this script just does that and exits.
// Kept as its own contract command (TP-004's optional `migrate`) even though
// dev/test/seed all pick up the same migrations automatically on boot.
createDb();
console.log(`Migrations applied to ${process.env.DATABASE_URL ?? "file:./dev.db"}`);
