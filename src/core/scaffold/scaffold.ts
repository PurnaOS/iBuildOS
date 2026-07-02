// `iBuild init`: materializes a new OKF-SDLC bundle from the embedded templates.
// The base type profile is copied verbatim as DATA — the taxonomy is never
// encoded in code. Init never overwrites an existing file, so it is safe to
// re-run. Port of Go internal/scaffold.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { TEMPLATES } from "./embedded.ts";

export interface InitOptions {
  example?: boolean; // also write a tiny, validate-clean example requirement
  full?: boolean; // select the full SDLC taxonomy instead of the lean core profile
}

export interface InitResult {
  created: string[]; // bundle-relative, slash-separated
  skipped: string[];
  alreadyInit: boolean; // .ibuildos.yaml already existed at the target
}

const PROFILES_PREFIX = "profiles/";

// Minimal, internally-consistent example requirements at `proposed` (a proposed,
// unimplemented requirement is a warning, never an error) so init→validate stays
// green with --example. The type must match the scaffolded profile.
const EXAMPLE_REQ_PATH = "docs/requirements/req-0001.md";
const EXAMPLE_REQ_CORE = `---
type: Requirement
id: REQ-0001
title: Example requirement — replace or delete me
owner: you
status: proposed
---

Scaffolded by \`iBuild init --example\`. Replace it with your real requirements,
then delete this file.
`;
const EXAMPLE_FR_PATH = "docs/requirements/fr-0001.md";
const EXAMPLE_FR_FULL = `---
type: FunctionalRequirement
id: FR-0001
title: Example requirement — replace or delete me
owner: you
status: proposed
---

Scaffolded by \`iBuild init --example --full\`. Use /ibuild-discover and
/ibuild-plan to build out the real chain, then delete this file.
`;

function writeFile(target: string, dest: string, data: string, res: InitResult): void {
  const full = join(target, dest);
  if (existsSync(full)) {
    res.skipped.push(dest);
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  res.created.push(dest);
}

// init scaffolds target into an iBuildOS bundle. It never overwrites existing files.
export function init(target: string, opts: InitOptions = {}): InitResult {
  const res: InitResult = { created: [], skipped: [], alreadyInit: existsSync(join(target, ".ibuildos.yaml")) };

  // Shared bundle skeleton, skipping the swappable type profiles.
  for (const key of Object.keys(TEMPLATES).sort()) {
    if (key.startsWith(PROFILES_PREFIX)) continue;
    const dest = key === "ibuildos.yaml" ? ".ibuildos.yaml" : key;
    writeFile(target, dest, TEMPLATES[key]!, res);
  }

  // Chosen type profile (core by default) into docs/types/.
  const profile = opts.full ? "full" : "core";
  const pfx = `${PROFILES_PREFIX}${profile}/`;
  for (const key of Object.keys(TEMPLATES).sort()) {
    if (!key.startsWith(pfx)) continue;
    writeFile(target, `docs/types/${key.slice(pfx.length)}`, TEMPLATES[key]!, res);
  }

  if (opts.example) {
    const path = opts.full ? EXAMPLE_FR_PATH : EXAMPLE_REQ_PATH;
    const body = opts.full ? EXAMPLE_FR_FULL : EXAMPLE_REQ_CORE;
    writeFile(target, path, body, res);
  }

  res.created.sort();
  res.skipped.sort();
  return res;
}
