// Builds the knowledge-graph export for a bundle, reusing the exact
// discover→parse→resolve pipeline Validate uses (link resolution included),
// discarding findings — graph is an export, not a gate. Result is finalized
// (sorted, deduped) and byte-stable. Port of Go internal/validate/export.go.
import { statSync } from "node:fs";
import type { Config } from "../config/config.ts";
import { Collector } from "../model/model.ts";
import { scalarText, nodeIsScalar, nodeIsSeq, seqItems } from "../okf/frontmatter.ts";
import { Registry } from "../types/registry.ts";
import type { Graph, GraphNode, GraphEdge, TypeSummary } from "../graphx/graph.ts";
import { finalize, focus } from "../graphx/graph.ts";
import { type Artifact, loadArtifacts } from "./validate.ts";
import { buildGraph } from "./graph.ts";

const RESERVED_NODE_FIELDS = new Set(["type", "status", "links"]);

export interface ExportOptions {
  body?: "excerpt" | "full" | "none";
  node?: string;
  depth?: number;
  rels?: string[];
}

// buildExportGraph returns the graph plus the compiled registry (callers that
// need field-level classification reuse the already-loaded type model).
export function buildExportGraph(bundleDir: string, cfg: Config, opts: ExportOptions = {}): { graph: Graph; reg: Registry } {
  const { reg, arts } = loadArtifacts(bundleDir, cfg, new Collector());
  buildGraph(arts, reg, cfg, new Collector()); // resolve links; swallow findings

  const body = opts.body ?? "excerpt";
  const g: Graph = { version: "1", generator: "iBuild graph", types: typeSummaries(reg), nodes: [], edges: [] };

  for (const a of arts) {
    const node: GraphNode = {
      key: a.rootRel,
      path: a.path,
      type: a.typ,
      knownType: a.typ !== "" && reg.has(a.typ),
    };
    if (a.status !== "") node.status = a.status;
    const fields = genericFields(a);
    if (fields) node.fields = fields;
    if (body !== "none" && a.doc) {
      node.excerpt = body === "full" ? a.doc.body.trim() : excerpt(a.doc.body, 500);
      if (node.excerpt === "") delete node.excerpt;
    }
    g.nodes.push(node);

    const res = reg.resolve(a.typ);
    if (res && !res.abstract && a.links) {
      for (const relName of Object.keys(a.links)) {
        const target = res.rels.get(relName)?.target ?? "";
        for (const rl of a.links[relName]!) {
          const edge: GraphEdge = { from: a.rootRel, to: rl.key, relationship: relName, resolved: rl.exists };
          if (target) edge.target = target;
          if (rl.targetType) edge.targetType = rl.targetType;
          g.edges.push(edge);
        }
      }
    } else {
      exportRawEdges(a, cfg, g);
    }
  }

  finalize(g);
  if (opts.node && opts.node !== "") {
    return { graph: focus(g, opts.node, Math.max(opts.depth ?? 1, 0), opts.rels ?? []), reg };
  }
  return { graph: g, reg };
}

// exportRawEdges projects the declared links of an unknown/abstract-typed doc
// into export edges without type-driven validation (no RelSpec → empty target;
// resolved = on-disk existence only).
function exportRawEdges(a: Artifact, cfg: Config, g: Graph): void {
  if (!a.doc) return;
  const raw = a.doc.links();
  for (const relName of Object.keys(raw).sort()) {
    for (const ref of raw[relName]!) {
      let resolved = false;
      if (ref.raw.trim() !== "") {
        try {
          resolved = !statSync(cfg.resolveLink(ref.raw)).isDirectory();
        } catch {
          resolved = false;
        }
      }
      g.edges.push({ from: a.rootRel, to: cfg.linkKey(ref.raw), relationship: relName, resolved });
    }
  }
}

function typeSummaries(reg: Registry): TypeSummary[] {
  const out: TypeSummary[] = [];
  for (const name of reg.defNames()) {
    const ts: TypeSummary = { name, abstract: reg.isAbstract(name), ancestors: reg.ancestors(name), relationships: [] };
    const ext = reg.extendsOf(name);
    if (ext !== "") ts.extends = ext;
    const res = reg.resolve(name);
    if (res) {
      for (const rn of [...res.rels.keys()].sort()) {
        const spec = res.rels.get(rn)!;
        ts.relationships.push({ name: rn, target: spec.target, min: spec.min, max: spec.max });
      }
    }
    out.push(ts);
  }
  return out;
}

// genericFields copies every scalar / scalar-list frontmatter value (except
// type/status/links) into a taxonomy-free map. nil when nothing to surface.
function genericFields(a: Artifact): Record<string, unknown> | null {
  if (!a.doc || !a.doc.map) return null;
  const out: Record<string, unknown> = {};
  for (const key of a.doc.keys()) {
    if (RESERVED_NODE_FIELDS.has(key)) continue;
    const g = a.doc.get(key);
    if (!g) continue;
    const vn = g.valNode;
    if (nodeIsScalar(vn)) {
      out[key] = scalarText(vn);
    } else if (nodeIsSeq(vn)) {
      const items = seqItems(vn);
      if (items.every(nodeIsScalar)) out[key] = items.map(scalarText);
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

// excerpt returns the first paragraph, whitespace-collapsed, truncated to max
// code points on a boundary.
export function excerpt(body: string, max: number): string {
  let s = body.trim();
  if (s === "") return "";
  const idx = s.indexOf("\n\n");
  if (idx >= 0) s = s.slice(0, idx);
  s = s.split(/\s+/).filter(Boolean).join(" ");
  const r = [...s];
  if (r.length > max) return r.slice(0, max).join("").trim() + "…";
  return s;
}
