// Small, dependency-free relative-time formatter for insights views (queue
// items, team notes) — the app has no date library in package.json yet, and
// pulling one in for "N minutes ago" strings isn't worth a new dependency.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const minutes = Math.round(diffMs / minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const hours = Math.round(diffMs / hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(diffMs / day);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
