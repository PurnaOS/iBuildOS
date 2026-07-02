// Glob matching + case-exact path checks. Port of Go internal/okf/glob.go.
import { readdirSync } from "node:fs";
import { join } from "node:path";

// pathCaseMatches reports whether the slash-separated relative path `rel` exists
// under baseDir with the EXACT case of every segment. The filesystem is
// case-insensitive on macOS and Windows, so a link to /work/Task.md or a glob
// segment Work/** would resolve there but NOT on a case-sensitive Linux CI box —
// making the linter's output (and exit code) OS-dependent. Checking each segment
// against the real directory entries restores byte-identical results everywhere.
// It also rejects ".." segments, since ".." is never an entry name.
//
// ponytail: O(depth × dir-size) per check via readdirSync; fine for bundles.
// Memoize per-directory listings for one run if a profile ever makes it hot.
export function pathCaseMatches(baseDir: string, rel: string): boolean {
  let cur = baseDir;
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      return false;
    }
    if (!entries.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}

// matchFiles returns the existing files under baseDir matching any of the globs
// (forward-slash, base-relative; a leading "/" is tolerated). Directories are
// excluded; results are deduped and sorted for determinism. Patterns support **.
export function matchFiles(baseDir: string, globs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of globs) {
    const g = raw.replace(/^\//, "");
    for (const m of new Bun.Glob(g).scanSync({ cwd: baseDir, onlyFiles: true, dot: false })) {
      const rel = m.replaceAll("\\", "/");
      if (!seen.has(rel) && pathCaseMatches(baseDir, rel)) {
        seen.add(rel);
        out.push(rel);
      }
    }
  }
  out.sort();
  return out;
}

// anyMatch reports whether any glob matches at least one existing file under baseDir.
export function anyMatch(baseDir: string, globs: string[]): boolean {
  for (const raw of globs) {
    const g = raw.replace(/^\//, "");
    for (const m of new Bun.Glob(g).scanSync({ cwd: baseDir, onlyFiles: true, dot: false })) {
      if (pathCaseMatches(baseDir, m.replaceAll("\\", "/"))) return true;
    }
  }
  return false;
}
