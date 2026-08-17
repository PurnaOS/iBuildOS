import { NextResponse } from "next/server";
import { listTasks } from "@/db/queries";

// Same reasoning as app/page.tsx: force-dynamic keeps this route out of the
// build-time static analysis pass so `next build` never touches the database.
export const dynamic = "force-dynamic";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}
