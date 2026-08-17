import { getDb } from "./client";
import { tasks, type NewTask } from "./schema";

export async function listTasks() {
  const db = getDb();
  return db.select().from(tasks);
}

export async function addTask(task: NewTask) {
  const db = getDb();
  return db.insert(tasks).values(task).returning();
}
