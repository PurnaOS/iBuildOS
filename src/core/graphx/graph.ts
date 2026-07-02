// The public, JSON-tagged model of the artifact knowledge graph derived from an
// OKF bundle — what `iBuild graph` emits and an AI agent reasons over (the
// requirements analog of a source-code graph). It hardcodes no taxonomy: a node
// carries `type` + `status` plus a generic `fields` map. Port of Go
// internal/graphx/graph.go.

export interface RelSummary {
  name: string;
  target: string;
  min: number;
  max: number | null; // null = unbounded
}

export interface TypeSummary {
  name: string;
  abstract: boolean;
  extends?: string;
  ancestors: string[];
  relationships: RelSummary[];
}

export interface GraphNode {
  key: string; // canonical /root-relative graph key
  path: string; // human-facing bundle-relative path
  type: string;
  knownType: boolean;
  status?: string;
  fields?: Record<string, unknown>;
  excerpt?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relationship: string;
  target?: string; // declared expected type
  targetType?: string; // actual type pointed at
  resolved: boolean;
}

export interface Graph {
  version: string;
  generator: string;
  types: TypeSummary[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Options {
  body?: "excerpt" | "full" | "none";
  node?: string; // focus key; "" = whole graph
  depth?: number;
  rels?: string[];
}

function edgeKey(e: GraphEdge): string {
  return `${e.from}\0${e.relationship}\0${e.to}\0${e.target ?? ""}\0${e.targetType ?? ""}\0${e.resolved}`;
}

// finalize sorts and dedupes every collection so the JSON is byte-stable.
export function finalize(g: Graph): void {
  g.types.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const t of g.types) t.relationships.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  g.nodes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seenNode = new Set<string>();
  g.nodes = g.nodes.filter((n) => (seenNode.has(n.key) ? false : (seenNode.add(n.key), true)));

  g.edges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.relationship !== b.relationship) return a.relationship < b.relationship ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    return 0;
  });
  const seenEdge = new Set<string>();
  g.edges = g.edges.filter((e) => (seenEdge.has(edgeKey(e)) ? false : (seenEdge.add(edgeKey(e)), true)));
}

// focus returns the subgraph around a node: the node plus everything within
// depth hops (edges undirected). Only real graph nodes act as traversal hubs —
// a dangling target is kept on a retained edge but never expanded. Port of Go Focus.
export function focus(g: Graph, node: string, depth: number, rels: string[]): Graph {
  const relSet = new Set(rels);
  const keep = (rel: string) => relSet.size === 0 || relSet.has(rel);
  const nodeSet = new Set(g.nodes.map((n) => n.key));

  const reach = new Set<string>([node]);
  let frontier = new Set<string>([node]);
  for (let d = 0; d < depth && frontier.size > 0; d++) {
    const next = new Set<string>();
    for (const e of g.edges) {
      if (!keep(e.relationship)) continue;
      if (frontier.has(e.from) && nodeSet.has(e.to) && !reach.has(e.to)) next.add(e.to);
      if (frontier.has(e.to) && nodeSet.has(e.from) && !reach.has(e.from)) next.add(e.from);
    }
    frontier = new Set();
    for (const k of next) {
      reach.add(k);
      frontier.add(k);
    }
  }

  const out: Graph = { version: g.version, generator: g.generator, types: g.types, nodes: [], edges: [] };
  for (const n of g.nodes) if (reach.has(n.key)) out.nodes.push(n);
  for (const e of g.edges) {
    if (!keep(e.relationship)) continue;
    if (reach.has(e.from) && reach.has(e.to)) out.edges.push(e);
    else if (reach.has(e.from) && !nodeSet.has(e.to)) out.edges.push(e);
    else if (reach.has(e.to) && !nodeSet.has(e.from)) out.edges.push(e);
  }
  return out;
}
