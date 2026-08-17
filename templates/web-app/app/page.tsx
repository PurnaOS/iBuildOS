import { listTasks } from "@/db/queries";

// This page reads from SQLite on every request. `force-dynamic` keeps it out
// of `next build`'s static prerender pass, so the build never needs a live
// database and `db:migrate`/`db:seed` stay separate, explicit steps.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const tasks = await listTasks();

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">iBuildOS web-app starter</h1>
      <p className="mt-2 text-sm text-gray-600">
        Next.js + TypeScript + Tailwind + SQLite (Drizzle). {tasks.length}{" "}
        task(s) loaded from SQLite via Drizzle.
      </p>
      <ul className="mt-4 space-y-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between rounded border border-gray-200 p-3"
          >
            <span>{task.title}</span>
            <span aria-label={task.done ? "done" : "not done"}>
              {task.done ? "✓" : "—"}
            </span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500">
            No tasks yet. Run <code>pnpm db:migrate</code> then{" "}
            <code>pnpm db:seed</code> to load the starter data.
          </li>
        )}
      </ul>
    </main>
  );
}
