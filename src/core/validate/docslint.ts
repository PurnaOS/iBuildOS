// Docs linting (VL-011): broken internal markdown links. Scans every .md under
// the bundle for body links to other .md files and verifies they resolve
// case-exactly to an existing file inside the bundle. External URLs and #anchors
// are ignored. Emitted as warnings (a stale cross-link is not a gate failure).
//
// ponytail: covers the high-value, low-false-positive slice of VL-011 (broken
// links). Required-sections + orphan-doc detection are deferred until a profile
// actually needs them — they add noise without a driving requirement yet.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import type { Config } from "../config/config.ts";
import { Collector } from "../model/model.ts";
import { matchFiles, pathCaseMatches } from "../okf/glob.ts";

// Matches a markdown link whose target is a .md file (optionally with #anchor).
const MD_LINK = /\]\(([^)\s]+\.md)(#[^)]*)?\)/g;

export function docsLint(bundleDir: string, cfg: Config, c: Collector): void {
  const rootDir = cfg.rootDir();
  if (!existsSync(rootDir)) return;
  let files: string[];
  try {
    files = matchFiles(rootDir, ["**/*.md"]);
  } catch {
    return;
  }
  for (const rel of files) {
    const absFile = join(rootDir, rel);
    const bundleRel = cfg.bundleRel(absFile);
    let raw: string;
    try {
      raw = readFileSync(absFile, "utf8");
    } catch {
      continue;
    }
    const lines = raw.replaceAll("\r\n", "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i]!.matchAll(MD_LINK)) {
        const target = m[1]!;
        if (target.includes("://")) continue; // external URL
        const absTarget = target.startsWith("/")
          ? join(rootDir, target.slice(1))
          : resolve(dirname(absFile), target);
        const relFromRoot = relative(rootDir, absTarget);
        const ok =
          !relFromRoot.startsWith("..") &&
          existsSync(absTarget) &&
          statSync(absTarget).isFile() &&
          pathCaseMatches(rootDir, relFromRoot.replaceAll("\\", "/"));
        if (!ok) {
          c.warnf(bundleRel, i + 1, "docs.brokenLink",
            `internal link ${JSON.stringify(target)} does not resolve to an existing file`);
        }
      }
    }
  }
}
