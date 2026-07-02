// Resolves the typed-link graph (Layer 2b): existence, target-type satisfaction,
// and cardinality. Populates each artifact's resolved links and the reverse
// indexes the chain rules query. Port of Go internal/validate/graph.go.
import { statSync, readFileSync } from "node:fs";
import type { Config } from "../config/config.ts";
import { Collector } from "../model/model.ts";
import { parse as parseOkf, scalarText, type LinkRef } from "../okf/frontmatter.ts";
import { pathCaseMatches } from "../okf/glob.ts";
import type { Registry, RelSpec } from "../types/registry.ts";
import type { Artifact, RLink } from "./validate.ts";

export interface Graph {
  byKey: Map<string, Artifact>;
  implementersOf: Map<string, Artifact[]>; // requirement key -> docs that implement it
  verifiersOf: Map<string, Artifact[]>; // requirement key -> tests that verify it
}

function push(m: Map<string, Artifact[]>, k: string, a: Artifact): void {
  const arr = m.get(k);
  if (arr) arr.push(a);
  else m.set(k, [a]);
}

export function buildGraph(arts: Artifact[], reg: Registry, cfg: Config, c: Collector): Graph {
  const g: Graph = { byKey: new Map(), implementersOf: new Map(), verifiersOf: new Map() };
  for (const a of arts) {
    if (a.rootRel !== "") g.byKey.set(a.rootRel, a);
  }
  const typeCache = new Map<string, string>(); // link key -> type, for targets outside the artifact set

  for (const a of arts) {
    if (!a.doc || !a.doc.hasFrontmatter || a.typ === "") continue;
    const res = reg.resolve(a.typ);
    if (!res || res.abstract) continue;
    const rawLinks = a.doc.links();
    a.links = {};

    for (const relName of [...res.rels.keys()].sort()) {
      const spec = res.rels.get(relName)!;
      const refs = rawLinks[relName] ?? [];
      let fallbackLine = a.doc.frontStartLine();
      if (refs.length > 0) fallbackLine = refs[0]!.line;
      if (refs.length < spec.min) {
        c.errf(a.path, fallbackLine, "rel.minCardinality",
          `relationship ${q(relName)} requires at least ${spec.min} link(s), found ${refs.length}`);
      }
      if (spec.max != null && refs.length > spec.max) {
        c.errf(a.path, fallbackLine, "rel.maxCardinality",
          `relationship ${q(relName)} allows at most ${spec.max} link(s), found ${refs.length}`);
      }
      const resolved: RLink[] = [];
      for (const ref of refs) resolved.push(resolveLink(a, ref, spec, relName, reg, cfg, g, typeCache, c));
      a.links[relName] = resolved;
    }

    // Unknown relationship keys under links: are tolerated with a warning.
    for (const relName of Object.keys(rawLinks)) {
      if (!res.rels.has(relName)) {
        const refs = rawLinks[relName]!;
        const line = refs.length > 0 ? refs[0]!.line : a.doc.frontStartLine();
        c.warnf(a.path, line, "link.unknownRelationship",
          `relationship ${q(relName)} is not declared by type ${q(a.typ)}`);
      }
    }

    // Reverse indexes for the chain rules; a self-reference is not external.
    for (const rl of a.links[cfg.chain.implementsRel] ?? []) {
      if (rl.exists && rl.key !== a.rootRel) push(g.implementersOf, rl.key, a);
    }
    for (const rl of a.links[cfg.chain.verifiesRel] ?? []) {
      if (rl.exists && rl.key !== a.rootRel) push(g.verifiersOf, rl.key, a);
    }
  }
  return g;
}

function resolveLink(
  a: Artifact, ref: LinkRef, spec: RelSpec, relName: string,
  reg: Registry, cfg: Config, g: Graph, cache: Map<string, string>, c: Collector,
): RLink {
  const rl: RLink = { raw: ref.raw, key: cfg.linkKey(ref.raw), line: ref.line, targetType: "", exists: false };
  if (ref.raw.trim() === "") {
    c.errf(a.path, ref.line, "link.unresolved", `${relName} link ${q(ref.raw)} does not resolve to an existing document`);
    return rl;
  }
  const diskPath = cfg.resolveLink(ref.raw);
  const rel = ref.raw.replace(/^\//, "");
  // The target must be an existing regular FILE inside the bundle root, resolved
  // case-sensitively (statSync case-folds on macOS/Windows; a dir is not a doc;
  // the path may not escape the root).
  let ok = false;
  try {
    const info = statSync(diskPath);
    ok = !info.isDirectory() && !cfg.linkEscapesRoot(diskPath) && pathCaseMatches(cfg.rootDir(), rel);
  } catch {
    ok = false;
  }
  if (!ok) {
    c.errf(a.path, ref.line, "link.unresolved", `${relName} link ${q(ref.raw)} does not resolve to an existing document`);
    return rl;
  }
  rl.exists = true;

  // Determine the target's type — even if it lives outside the artifact globs.
  const inSet = g.byKey.get(rl.key);
  if (inSet) {
    rl.targetType = inSet.typ;
  } else if (cache.has(rl.key)) {
    rl.targetType = cache.get(rl.key)!;
  } else {
    try {
      const [d, err] = parseOkf(diskPath, readFileSync(diskPath, "utf8"));
      if (!err && d.hasFrontmatter) {
        const tv = d.get("type");
        if (tv) rl.targetType = scalarText(tv.valNode);
      }
    } catch {
      /* unreadable target — leave targetType empty */
    }
    cache.set(rl.key, rl.targetType);
  }

  if (spec.target !== "") {
    if (rl.targetType === "" || !reg.has(rl.targetType)) {
      c.warnf(a.path, ref.line, "link.unknownTargetType",
        `${relName} link ${q(ref.raw)} points to a document of unknown type; target not checked`);
    } else if (!reg.satisfies(rl.targetType, spec.target)) {
      c.errf(a.path, ref.line, "link.wrongTarget",
        `${relName} link ${q(ref.raw)} points to type ${q(rl.targetType)}; expected ${spec.target} or a subtype`);
    }
  }
  return rl;
}

function q(s: string): string {
  return JSON.stringify(s);
}
