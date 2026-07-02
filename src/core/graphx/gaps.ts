// Deterministic gap detection (GP-001..004): structural answers about
// code↔knowledge alignment, faster than an agent. Capability/ChainConfig-driven.
//   - orphanCode: source files matched by no Task's `code` globs (GP-002)
//   - untestedRequirements: active requirements with no verifying test (GP-004)
//   - unimplementedRequirements: active requirements nothing implements
import type { Config } from "../config/config.ts";
import type { Registry } from "../types/registry.ts";
import type { Graph } from "./graph.ts";

export interface Gaps {
  version: string;
  generator: string;
  summary: { orphanCode: number; untestedRequirements: number; unimplementedRequirements: number };
  orphanCode: string[];
  untestedRequirements: string[];
  unimplementedRequirements: string[];
}

export function buildGaps(graph: Graph, reg: Registry, cfg: Config, sourceFiles: string[]): Gaps {
  const reqTargets = reg.relTargets(cfg.chain.implementsRel);
  const isReq = (t: string) => reg.satisfiesAny(t, reqTargets);
  const active = (s: string) => cfg.chain.activeReqStatuses.includes(s);

  const hasIncoming = (key: string, rel: string): boolean =>
    graph.edges.some((e) => e.to === key && e.relationship === rel && e.resolved);

  const untested: string[] = [];
  const unimplemented: string[] = [];
  for (const n of graph.nodes) {
    if (!isReq(n.type) || !active(n.status ?? "")) continue;
    if (!hasIncoming(n.key, cfg.chain.verifiesRel)) untested.push(n.key);
    if (!hasIncoming(n.key, cfg.chain.implementsRel)) unimplemented.push(n.key);
  }

  // Union of every Task's code globs, matched against the source file list.
  const codeField = cfg.chain.codeField;
  const globs: Bun.Glob[] = [];
  for (const n of graph.nodes) {
    const g = n.fields?.[codeField];
    if (Array.isArray(g)) for (const item of g) globs.push(new Bun.Glob(String(item).replace(/^\//, "")));
  }
  const orphanCode = sourceFiles
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !globs.some((gl) => gl.match(f)))
    .sort();

  return {
    version: "1",
    generator: "iBuild gaps",
    summary: { orphanCode: orphanCode.length, untestedRequirements: untested.length, unimplementedRequirements: unimplemented.length },
    orphanCode,
    untestedRequirements: untested.sort(),
    unimplementedRequirements: unimplemented.sort(),
  };
}
