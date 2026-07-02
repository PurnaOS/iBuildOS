// The rules engine (Layer 2). Per-document checks (2a), typed-link graph
// resolution (2b), and the Requirement -> Task -> Code -> Test completeness
// rules. The only chain-specific coupling lives in config.ChainConfig; everything
// else is data-driven. Port of Go internal/validate.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config/config.ts";
import { Collector, finalize, type Finding } from "../model/model.ts";
import { type Document, parse as parseOkf, scalarText } from "../okf/frontmatter.ts";
import { matchFiles } from "../okf/glob.ts";
import { Registry } from "../types/registry.ts";
import { validateDoc } from "./document.ts";
import { validateCode } from "./code.ts";
import { buildGraph } from "./graph.ts";
import { completeness } from "./complete.ts";
import { docsLint } from "./docslint.ts";

// Artifact is a discovered bundle document under validation.
export interface Artifact {
  doc: Document | null;
  path: string; // bundle-relative, slash-separated (for findings)
  rootRel: string; // /work/task-0001.md — the canonical graph key
  typ: string;
  status: string;
  links: Record<string, RLink[]>; // populated by buildGraph
}

// RLink is a resolved typed link.
export interface RLink {
  raw: string;
  key: string; // canonical /root-relative key
  line: number;
  targetType: string;
  exists: boolean;
}

export function idOrPath(a: Artifact): string {
  if (a.doc) {
    const g = a.doc.get("id");
    if (g) {
      const v = scalarText(g.valNode);
      if (v !== "") return v;
    }
  }
  return a.path;
}

export function contains(list: string[], v: string): boolean {
  return list.includes(v);
}

// ValidateOptions scopes the RETURNED findings to a subset of artifacts. The
// full graph is always resolved (so links/completeness are accurate); only the
// emitted findings are filtered. This single primitive backs changed-artifacts-
// only mode (VL-013), path-scoped adoption (IN-011), and stack-aware validation
// (VC-007). `scope` entries are bundle-relative globs (or exact paths).
export interface ValidateOptions {
  scope?: string[];
}

// validate runs the full pipeline over the bundle and returns sorted, deduped findings.
export function validate(bundleDir: string, cfg: Config, opts: ValidateOptions = {}): Finding[] {
  const c = new Collector();

  let loaded: { reg: Registry; arts: Artifact[] };
  try {
    loaded = loadArtifacts(bundleDir, cfg, c);
  } catch (e) {
    c.errf(cfg.bundleRel(cfg.typesDir()), 0, "types.loadDir",
      `cannot read types directory ${JSON.stringify(cfg.typesDir())}: ${(e as Error).message}`);
    return finalize(c.items);
  }
  const { reg, arts } = loaded;

  for (const a of arts) {
    validateDoc(a, reg, c);
    validateCode(a, cfg, c);
  }
  const g = buildGraph(arts, reg, cfg, c);
  completeness(arts, g, reg, cfg, c);
  docsLint(bundleDir, cfg, c);

  let out = finalize(c.items);
  if (opts.scope && opts.scope.length > 0) {
    const globs = opts.scope.map((g) => new Bun.Glob(g.replace(/^\//, "")));
    const inScope = (file: string): boolean =>
      opts.scope!.includes(file) || globs.some((g) => g.match(file));
    out = out.filter((f) => inScope(f.file));
  }
  return out;
}

// loadArtifacts loads the type registry and discovers + parses every artifact
// under the bundle's globs. Shared front half of Validate and the graph export.
// Throws only if the types directory is unreadable.
export function loadArtifacts(bundleDir: string, cfg: Config, c: Collector): { reg: Registry; arts: Artifact[] } {
  const reg = Registry.load(cfg.typesDir(), bundleDir, c);

  const rootDir = cfg.rootDir();
  let files: string[] = [];
  if (existsSync(rootDir)) {
    try {
      files = matchFiles(rootDir, cfg.artifacts);
    } catch (e) {
      c.errf(cfg.root, 0, "config.badGlob", `invalid artifacts glob: ${(e as Error).message}`);
    }
  }

  const arts: Artifact[] = [];
  for (const rel of files) {
    // OKF concepts are markdown. A glob like requirements/** also matches stray
    // non-.md files (.gitkeep, .DS_Store); tolerate them by skipping.
    if (!rel.endsWith(".md")) continue;
    const abs = join(rootDir, rel);
    const a: Artifact = { doc: null, path: cfg.bundleRel(abs), rootRel: cfg.rootRel(abs), typ: "", status: "", links: {} };
    let raw: string;
    try {
      raw = readFileSync(abs, "utf8");
    } catch (e) {
      c.errf(a.path, 0, "doc.read", `cannot read file: ${(e as Error).message}`);
      continue;
    }
    const [d, perr] = parseOkf(abs, raw);
    a.doc = d;
    if (perr) c.errf(a.path, 0, "doc.parse", perr.message);
    if (d.hasFrontmatter) {
      const tv = d.get("type");
      if (tv) a.typ = scalarText(tv.valNode);
      const sv = d.get("status");
      if (sv) a.status = scalarText(sv.valNode);
    }
    arts.push(a);
  }
  return { reg, arts };
}
