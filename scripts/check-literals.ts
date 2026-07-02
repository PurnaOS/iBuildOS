#!/usr/bin/env bun
// Enforces invariant (a)/(e): the engine is data-driven. The ONLY taxonomy type
// name that may appear as a string literal in src/ is "ArtifactType", and only in
// src/core/types/registry.ts. Every other type name (Task, Requirement, …) is
// read from the profile at runtime — hardcoding one is the anti-pattern this gate
// fails on. The denylist is seeded from the profile's own `defines:` names, so it
// updates itself when a type is added to docs/types/.
import { join, relative } from "node:path";
import { readFileSync } from "node:fs";
import { load } from "../src/core/config/config.ts";
import { Registry } from "../src/core/types/registry.ts";
import { Collector } from "../src/core/model/model.ts";

const repoRoot = join(import.meta.dir, "..");
const META = "ArtifactType";
const META_FILE = "src/core/types/registry.ts"; // the one place META may live
// Generated template DATA (the analog of Go's excluded templates/ dir): it
// embeds the profile markdown verbatim, which legitimately names every type.
const EXCLUDE = new Set(["src/core/scaffold/embedded.ts"]);

const cfg = load(repoRoot);
const reg = Registry.load(cfg.typesDir(), repoRoot, new Collector());
const denylist = reg.defNames().filter((n) => n !== META);

const violations: string[] = [];
const srcDir = join(repoRoot, "src");

for (const rel of new Bun.Glob("**/*.ts").scanSync({ cwd: srcDir, onlyFiles: true })) {
  const file = join(srcDir, rel);
  const repoRel = relative(repoRoot, file).replaceAll("\\", "/");
  if (EXCLUDE.has(repoRel)) continue;
  const text = readFileSync(file, "utf8");
  // A taxonomy name used as an exact quoted string literal.
  for (const name of denylist) {
    const re = new RegExp(`(['"\`])${name}\\1`, "g");
    if (re.test(text)) violations.push(`${repoRel}: hardcoded taxonomy literal ${JSON.stringify(name)} — read it from the profile instead`);
  }
  // "ArtifactType" is allowed only in the meta-type file.
  if (repoRel !== META_FILE && /(['"`])ArtifactType\1/.test(text)) {
    violations.push(`${repoRel}: "ArtifactType" literal outside ${META_FILE}`);
  }
}

if (violations.length > 0) {
  console.error(`check-literals: ${violations.length} violation(s):`);
  for (const v of violations.sort()) console.error("  " + v);
  process.exit(1);
}
console.log(`check-literals: ok (${denylist.length} taxonomy names guarded across src/)`);
