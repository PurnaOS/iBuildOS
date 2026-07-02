// Deterministic change-impact analysis (AG-005): given a set of changed repo
// files, find the Tasks whose `code` globs match them, then the requirements
// they implement, the tests that verify those tasks, and their parents — by
// walking the resolved graph. No AI; the deterministic engine answers the
// structural question. Capability/ChainConfig-driven, no type literal.
import type { Config } from "../config/config.ts";
import type { Graph } from "./graph.ts";

export interface Impact {
  version: string;
  generator: string;
  changed: string[];
  affectedTasks: string[];
  affectedRequirements: string[];
  affectedTests: string[];
  affectedParents: string[];
}

export function buildImpact(graph: Graph, cfg: Config, changed: string[]): Impact {
  const codeField = cfg.chain.codeField;
  const files = changed.map((f) => f.replaceAll("\\", "/"));
  const matchers = new Map<string, Bun.Glob>();
  const matches = (glob: string): boolean => {
    const g = glob.replace(/^\//, "");
    let m = matchers.get(g);
    if (!m) {
      m = new Bun.Glob(g);
      matchers.set(g, m);
    }
    return files.some((f) => m!.match(f));
  };

  const affectedTasks = new Set<string>();
  for (const n of graph.nodes) {
    const globs = n.fields?.[codeField];
    if (Array.isArray(globs) && globs.some((g) => matches(String(g)))) affectedTasks.add(n.key);
  }

  const reqs = new Set<string>();
  const tests = new Set<string>();
  const parents = new Set<string>();
  for (const e of graph.edges) {
    if (!affectedTasks.has(e.from) || !e.resolved) continue;
    if (e.relationship === cfg.chain.implementsRel) reqs.add(e.to);
    else if (e.relationship === cfg.chain.verifiedByRel) tests.add(e.to);
    else if (e.relationship === cfg.chain.parentRel) parents.add(e.to);
  }

  const sorted = (s: Set<string>) => [...s].sort();
  return {
    version: "1",
    generator: "iBuild impact",
    changed: [...files].sort(),
    affectedTasks: sorted(affectedTasks),
    affectedRequirements: sorted(reqs),
    affectedTests: sorted(tests),
    affectedParents: sorted(parents),
  };
}
