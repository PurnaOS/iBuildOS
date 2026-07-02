// Deterministic progress + knowledge-base-health dashboard (PM-001/003/004),
// derived entirely from the graph + validation findings — reproducible, no
// hand-maintained tracker. Capability/ChainConfig-driven.
import type { Config } from "../config/config.ts";
import type { Registry } from "../types/registry.ts";
import type { Graph } from "../graphx/graph.ts";
import { type Finding, countBySeverity } from "../model/model.ts";
import { buildRtm } from "../graphx/rtm.ts";

export interface Status {
  version: string;
  generator: string;
  profile: { name: string; version: string };
  validation: { errors: number; warnings: number };
  requirements: { requirements: number; implemented: number; verified: number; traced: number };
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  orphanActiveRequirements: string[]; // active requirements nothing implements
}

export function buildStatus(graph: Graph, reg: Registry, cfg: Config, findings: Finding[]): Status {
  const rtm = buildRtm(graph, reg, cfg);
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of graph.nodes) {
    if (n.type) byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.status) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  const active = new Set(cfg.chain.activeReqStatuses);
  const orphanActive = rtm.requirements
    .filter((r) => active.has(r.status) && r.implementedBy.length === 0)
    .map((r) => r.key)
    .sort();

  return {
    version: "1",
    generator: "iBuild status",
    profile: { name: cfg.profile.name, version: cfg.profile.version },
    validation: countBySeverity(findings),
    requirements: rtm.summary,
    byType,
    byStatus,
    orphanActiveRequirements: orphanActive,
  };
}
