// Studio read oracles: thin builders over the deterministic engine. Each returns
// a plain object/string; server.ts wraps them in HTTP responses. No findings are
// computed here — these call the same exported engine functions the CLI does.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { load, type Config } from "../config/config.ts";
import { validate } from "../validate/validate.ts";
import { countBySeverity as count2 } from "../model/model.ts";
import { worktreeList } from "./git.ts";
import { buildExportGraph } from "../validate/export.ts";
import { buildRtm } from "../graphx/rtm.ts";
import { buildGaps } from "../graphx/gaps.ts";
import { buildStatus } from "../metrics/status.ts";
import { buildMine } from "../metrics/mine.ts";
import { write as writeInstructions } from "../instructions/instructions.ts";
import { agentsMD } from "../contract/contract.ts";
import { matchFiles } from "../okf/glob.ts";
import { countBySeverity } from "../model/model.ts";
import type { Graph } from "../graphx/graph.ts";

export interface StudioContext {
  bundleDir: string;
  cfg: Config;
  version: string;
}

export interface GraphParams {
  node?: string;
  depth?: number;
  rels?: string[];
  body?: "excerpt" | "full" | "none";
}

function sourceFiles(ctx: StudioContext): string[] {
  if (ctx.cfg.tooling.source.length === 0 || !existsSync(ctx.bundleDir)) return [];
  try {
    return matchFiles(ctx.bundleDir, ctx.cfg.tooling.source);
  } catch {
    return [];
  }
}

export function apiStatus(ctx: StudioContext) {
  const { graph, reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  return buildStatus(graph, reg, ctx.cfg, validate(ctx.bundleDir, ctx.cfg));
}

export function apiGraph(ctx: StudioContext, p: GraphParams): Graph {
  const opts: { body: "excerpt" | "full" | "none"; node?: string; depth?: number; rels?: string[] } = {
    body: p.body ?? "excerpt",
  };
  if (p.node) opts.node = p.node;
  if (p.depth !== undefined) opts.depth = p.depth;
  if (p.rels) opts.rels = p.rels;
  return buildExportGraph(ctx.bundleDir, ctx.cfg, opts).graph;
}

export function apiMatrix(ctx: StudioContext) {
  const { graph, reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  return buildRtm(graph, reg, ctx.cfg);
}

export function apiGaps(ctx: StudioContext) {
  const { graph, reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  return buildGaps(graph, reg, ctx.cfg, sourceFiles(ctx));
}

export function apiFindings(ctx: StudioContext) {
  const findings = validate(ctx.bundleDir, ctx.cfg);
  return { ...countBySeverity(findings), findings };
}

export function apiConfig(ctx: StudioContext) {
  const c = ctx.cfg;
  return {
    profile: c.profile,
    root: c.root,
    types: c.types,
    artifacts: c.artifacts,
    chain: c.chain,
    tooling: c.tooling,
  };
}

export function apiTypes(ctx: StudioContext) {
  return buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" }).graph.types;
}

export function apiInstructions(ctx: StudioContext, type: string): unknown {
  const { reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  return JSON.parse(writeInstructions(reg, type, "json"));
}

export function apiAgentsMD(ctx: StudioContext): string {
  return agentsMD(ctx.cfg, ctx.version);
}

export function apiMine(ctx: StudioContext, identity: string) {
  const { graph } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  return buildMine(graph, identity);
}

// apiRequirements groups requirements by capability area (the `area` field, else
// the type) with per-area traced counts — a cleaner, foldable view than a flat
// 192-row list. Data-driven: "requirement" is the RTM capability predicate.
export function apiRequirements(ctx: StudioContext) {
  const { graph, reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  const rtm = buildRtm(graph, reg, ctx.cfg);
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const groups = new Map<string, Array<{ key: string; id: string; title: string; status: string; implemented: boolean; verified: boolean; traced: boolean }>>();
  for (const row of rtm.requirements) {
    const n = byKey.get(row.key);
    const area = typeof n?.fields?.area === "string" && n.fields.area !== "" ? (n.fields.area as string) : row.type;
    const title = typeof n?.fields?.title === "string" ? (n.fields.title as string) : "";
    const arr = groups.get(area) ?? [];
    arr.push({ key: row.key, id: row.id, title, status: row.status, implemented: row.implementedBy.length > 0, verified: row.verifiedBy.length > 0, traced: row.traced });
    groups.set(area, arr);
  }
  const areas = [...groups.entries()]
    .map(([area, items]) => ({
      area,
      total: items.length,
      traced: items.filter((i) => i.traced).length,
      items: items.sort((a, b) => (a.id < b.id ? -1 : 1)),
    }))
    .sort((a, b) => (a.area < b.area ? -1 : 1));
  return { version: "1", generator: "iBuild requirements", summary: rtm.summary, areas };
}

// apiNode returns one artifact's full detail for the Studio detail view: the node
// (full body + all fields), its outgoing links, and everything that references it
// (incoming edges) — each enriched with the other end's type + title.
export function apiNode(ctx: StudioContext, key: string) {
  const { graph } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "full", node: key, depth: 1 });
  const node = graph.nodes.find((n) => n.key === key) ?? null;
  if (!node) return { node: null, outgoing: [], incoming: [] };
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const other = (k: string) => {
    const t = byKey.get(k);
    return { key: k, type: t?.type ?? "", title: typeof t?.fields?.title === "string" ? (t.fields.title as string) : "" };
  };
  const outgoing = graph.edges
    .filter((e) => e.from === key)
    .map((e) => ({ relationship: e.relationship, resolved: e.resolved, ...other(e.to), targetType: e.targetType ?? "" }))
    .sort((a, b) => (a.relationship + a.key < b.relationship + b.key ? -1 : 1));
  const incoming = graph.edges
    .filter((e) => e.to === key)
    .map((e) => ({ relationship: e.relationship, resolved: e.resolved, ...other(e.from) }))
    .sort((a, b) => (a.relationship + a.key < b.relationship + b.key ? -1 : 1));
  return { node, outgoing, incoming };
}

// apiBoard is the work-planning board (UI-012): work items (capability: their
// type declares the parent relationship) with status + parent, for grouping into
// a backlog/board. Data-driven — no type-name literal.
export function apiBoard(ctx: StudioContext) {
  const { graph, reg } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  const parentRel = ctx.cfg.chain.parentRel;
  const isWork = (t: string) => reg.resolve(t)?.rels.has(parentRel) ?? false;
  const parentOf = new Map<string, string>();
  for (const e of graph.edges) if (e.relationship === parentRel && e.resolved) parentOf.set(e.from, e.to);
  const items = graph.nodes
    .filter((n) => isWork(n.type))
    .map((n) => ({
      key: n.key,
      type: n.type,
      status: n.status ?? "",
      title: typeof n.fields?.title === "string" ? (n.fields.title as string) : "",
      owner: typeof n.fields?.owner === "string" ? (n.fields.owner as string) : "",
      parent: parentOf.get(n.key) ?? "",
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return { version: "1", generator: "iBuild board", total: items.length, items };
}

// apiTeam is the team-management view (UI-016): per-owner workload + assignee
// counts, derived from the owner field + the assignee relationship (data-driven).
export function apiTeam(ctx: StudioContext) {
  const { graph } = buildExportGraph(ctx.bundleDir, ctx.cfg, { body: "none" });
  const done = new Set(ctx.cfg.chain.doneStatuses);
  const owners = new Map<string, { total: number; done: number }>();
  for (const n of graph.nodes) {
    const o = n.fields?.owner;
    if (typeof o === "string" && o !== "") {
      const e = owners.get(o) ?? { total: 0, done: 0 };
      e.total++;
      if (done.has(n.status ?? "")) e.done++;
      owners.set(o, e);
    }
  }
  const assigned = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.relationship === "assignee" && e.resolved) assigned.set(e.to, (assigned.get(e.to) ?? 0) + 1);
  }
  return {
    version: "1",
    generator: "iBuild team",
    owners: [...owners.entries()].map(([owner, v]) => ({ owner, total: v.total, done: v.done, open: v.total - v.done })).sort((a, b) => (a.owner < b.owner ? -1 : 1)),
    assigned: [...assigned.entries()].map(([actor, count]) => ({ actor, count })).sort((a, b) => (a.actor < b.actor ? -1 : 1)),
  };
}

// apiWorkspaces lists git worktrees (parallel agent workspaces, UI-006) with a
// best-effort validation state for any that hold an iBuildOS bundle.
export function apiWorkspaces(ctx: StudioContext) {
  return worktreeList(ctx.bundleDir).map((wt) => {
    let errors: number | null = null;
    let warnings: number | null = null;
    if (existsSync(join(wt.path, ".ibuildos.yaml"))) {
      try {
        const c = count2(validate(wt.path, load(wt.path)));
        errors = c.errors;
        warnings = c.warnings;
      } catch {
        /* leave null */
      }
    }
    return { path: wt.path, branch: wt.branch, head: wt.head, errors, warnings };
  });
}
