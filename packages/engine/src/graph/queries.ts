import type { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, type GraphArtifact } from "./graph.js";

// Higher-level query surface built on top of ArtifactGraph's edge storage:
// reverse lookups, impact traversal, and the SCC-based cycle detector
// `link/cycles` (rules/links.ts) relies on.

export type GraphDirection = "forward" | "backward";

/** BFS reachability from `id`, following outgoing (forward) or incoming
 * (backward) edges, optionally restricted to one relationship name. Does not
 * include `id` itself. Dangling edges (target not in the bundle) are
 * followed no further — `graph.has()` gates every hop. */
export function reachable(
  graph: ArtifactGraph,
  id: string,
  direction: GraphDirection,
  relationship?: string,
): Set<string> {
  const start = id.toUpperCase();
  const visited = new Set<string>();
  const queue: string[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edges =
      direction === "forward"
        ? graph.outgoing(current, relationship)
        : graph.incoming(current, relationship);
    for (const edge of edges) {
      const next = direction === "forward" ? edge.targetId : edge.from;
      if (next === start) continue;
      if (!graph.has(next)) continue;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return visited;
}

export interface Impact {
  /** Everything reachable by following this artifact's own links outward
   * (what it depends on / implements / verifies, transitively). */
  forward: Set<string>;
  /** Everything reachable by following other artifacts' links back to this
   * one (what depends on / implements / verifies it, transitively). */
  backward: Set<string>;
}

/** Full impact of an artifact: forward + backward reachability, optionally
 * restricted to one relationship name (e.g. just `depends_on`). */
export function impact(graph: ArtifactGraph, id: string, relationship?: string): Impact {
  return {
    forward: reachable(graph, id, "forward", relationship),
    backward: reachable(graph, id, "backward", relationship),
  };
}

/** Reverse-index convenience: every distinct artifact ID that links to `id`
 * (optionally via one relationship), sorted. */
export function whoLinksTo(graph: ArtifactGraph, id: string, relationship?: string): string[] {
  return [...new Set(graph.incoming(id, relationship).map((e) => e.from))].sort();
}

/** Every artifact whose type is-or-extends `typeName` (polymorphic, via
 * `ProfileRegistry.satisfies`). Types unknown to the registry are skipped
 * (KB-008 tolerance), never thrown. */
export function artifactsSatisfying(
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  typeName: string,
): GraphArtifact[] {
  return graph
    .allArtifacts()
    .filter((a) => registry.has(a.type) && registry.satisfies(a.type, typeName));
}

/**
 * Strongly-connected components (Tarjan's algorithm) over the subgraph
 * formed by edges of a single relationship name. Returns only components
 * that are actual cycles: size > 1, or a single node with a self-edge.
 * Dangling edges (target not present in the bundle) are excluded from the
 * subgraph — a dangling link is `link/target-exists`'s concern, not a cycle.
 * Each component is returned sorted; components are sorted by their first
 * (lexicographically smallest) member, so the result is fully deterministic
 * regardless of traversal order.
 */
export function findCycles(graph: ArtifactGraph, relationship: string): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edgesByRelationship(relationship)) {
    if (!graph.has(edge.targetId)) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.targetId);
    adjacency.set(edge.from, list);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  }

  for (const v of adjacency.keys()) {
    if (!indices.has(v)) strongconnect(v);
  }

  return components
    .filter((c) => c.length > 1 || (adjacency.get(c[0]!) ?? []).includes(c[0]!))
    .map((c) => [...c].sort())
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
}
