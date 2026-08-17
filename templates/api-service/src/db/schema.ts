import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Minimal, real schema for the scaffold: one table, enough to prove the
// dev/test/seed/build/migrate commands all touch a genuine SQLite database
// through Drizzle. Extend or replace once the project has real domain data.
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
