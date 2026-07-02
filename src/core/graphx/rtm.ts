// Requirements Traceability Matrix (TR-006): for every requirement node, which
// work implements it and which tests verify it, derived from the resolved graph.
// Capability-predicate based (a "requirement" is-or-extends the target of the
// implements relationship) — no type literal. Net-new in the TS build.
import type { Config } from "../config/config.ts";
import type { Registry } from "../types/registry.ts";
import type { Graph } from "./graph.ts";

export interface RtmRow {
  key: string;
  id: string;
  type: string;
  status: string;
  implementedBy: string[];
  verifiedBy: string[];
  traced: boolean; // implemented AND verified
}

export interface Rtm {
  version: string;
  generator: string;
  summary: { requirements: number; implemented: number; verified: number; traced: number };
  requirements: RtmRow[];
}

export function buildRtm(graph: Graph, reg: Registry, cfg: Config): Rtm {
  const reqTargets = reg.relTargets(cfg.chain.implementsRel);
  const isReq = (t: string) => reg.satisfiesAny(t, reqTargets);

  const incoming = (key: string, rel: string): string[] =>
    graph.edges.filter((e) => e.to === key && e.relationship === rel && e.resolved).map((e) => e.from).sort();

  const rows: RtmRow[] = [];
  for (const n of graph.nodes) {
    if (!isReq(n.type)) continue;
    const implementedBy = incoming(n.key, cfg.chain.implementsRel);
    const verifiedBy = incoming(n.key, cfg.chain.verifiesRel);
    rows.push({
      key: n.key,
      id: typeof n.fields?.id === "string" ? (n.fields.id as string) : n.key,
      type: n.type,
      status: n.status ?? "",
      implementedBy,
      verifiedBy,
      traced: implementedBy.length > 0 && verifiedBy.length > 0,
    });
  }
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    version: "1",
    generator: "iBuild matrix",
    summary: {
      requirements: rows.length,
      implemented: rows.filter((r) => r.implementedBy.length > 0).length,
      verified: rows.filter((r) => r.verifiedBy.length > 0).length,
      traced: rows.filter((r) => r.traced).length,
    },
    requirements: rows,
  };
}
