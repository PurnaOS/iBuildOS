import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The engine deliberately stays pure/in-memory (AGENTS.md, Wave 1's design) —
// filesystem walking belongs in the CLI. `fs.readdirSync(root, { recursive:
// true, withFileTypes: true })` (Node >=20.1) does the traversal; this module
// just filters and sorts.

/** Every `*.md` file under `root`, absolute paths, sorted for determinism.
 * `excludeDirName`, when given, prunes any file under a directory segment
 * with that exact name anywhere in its path relative to `root` (used to keep
 * `docs/profile/*.md` TypeDefinitions out of the artifact walk — FORMATS §3
 * reserves that directory for the type-profile dialect, not artifacts). */
export function walkMarkdownFiles(root: string, options: { excludeDirName?: string } = {}): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    return []; // root doesn't exist — an empty bundle, not a crash
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const parentDir = (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path?: string }).path
      ?? root;
    const full = join(parentDir, entry.name);

    if (options.excludeDirName) {
      const rel = relative(root, full);
      const segments = rel.split(sep);
      if (segments.includes(options.excludeDirName)) continue;
    }

    files.push(full);
  }

  return files.sort();
}
