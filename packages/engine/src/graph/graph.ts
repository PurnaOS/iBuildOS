import type { ProfileRegistry } from "../profile/registry.js";

// In-memory typed graph over a bundle of parsed artifacts (FORMATS.md §4's
// frontmatter `links:` block is the edge source). Nodes are keyed by
// artifact ID (uppercased per FORMATS §2: "case-insensitive on input,
// canonical uppercase on write" — the graph normalizes at the boundary so
// callers never have to remember to uppercase a lookup themselves). Edges
// carry the relationship name (the `links:` map key) plus both the raw
// target string (which may be a criterion ref like "ST-0042#AC-2") and its
// base artifact ID (the criterion ref stripped) so rules can resolve the
// *artifact* a link targets without special-casing criterion refs.

/** One parsed artifact as the graph needs it — a subset of what the OKF
 * store + profile registry produce, deliberately decoupled from either so
 * the graph has no parse-time dependency. */
export interface GraphArtifact {
  id: string;
  type: string;
  frontmatter: Record<string, unknown>;
}

/** One typed edge, derived from one entry in one `links:` relationship
 * array. `target` is the raw string as written (ID or `ID#AC-n`); `targetId`
 * is always a plain, uppercased artifact ID. */
export interface GraphEdge {
  from: string;
  relationship: string;
  target: string;
  targetId: string;
}

/** Strip a criterion reference (`ID#AC-n`) down to its base artifact ID and
 * canonicalize case (FORMATS.md §2). Plain IDs pass through unchanged
 * (besides case). */
export function baseArtifactId(target: string): string {
  const hashIndex = target.indexOf("#");
  const raw = hashIndex === -1 ? target : target.slice(0, hashIndex);
  return raw.toUpperCase();
}

/** Type guard for "plain object, not an array" — used throughout the rules
 * modules to defensively read `frontmatter.links` (KB-008: malformed shapes
 * are tolerated, not fatal — a rule that cares about the shape, like
 * `doc/field-kind`, is responsible for flagging it; the graph and other
 * rules just skip what they can't make sense of). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractEdges(artifact: GraphArtifact): GraphEdge[] {
  const links = artifact.frontmatter.links;
  if (!isRecord(links)) return [];

  const edges: GraphEdge[] = [];
  for (const [relationship, rawTargets] of Object.entries(links)) {
    if (!Array.isArray(rawTargets)) continue; // malformed — not the graph's concern
    for (const target of rawTargets) {
      if (typeof target !== "string") continue;
      edges.push({
        from: artifact.id,
        relationship,
        target,
        targetId: baseArtifactId(target),
      });
    }
  }
  return edges;
}

export class ArtifactGraph {
  private readonly nodesById = new Map<string, GraphArtifact>();
  private readonly outEdges = new Map<string, GraphEdge[]>();
  private readonly inEdges = new Map<string, GraphEdge[]>();

  /** Last-write-wins on a duplicate ID: a later artifact with the same ID
   * silently replaces an earlier one, and the earlier one's edges are lost.
   * That's `id/duplicate`'s job to catch, not the graph's — callers running
   * `id/duplicate` must feed it the raw parsed-artifact list, never
   * `allArtifacts()`, or the duplicate becomes unobservable. */
  constructor(artifacts: readonly GraphArtifact[]) {
    for (const artifact of artifacts) {
      const id = artifact.id.toUpperCase();
      this.nodesById.set(id, { ...artifact, id });
    }
    for (const artifact of this.nodesById.values()) {
      for (const edge of extractEdges(artifact)) {
        const outs = this.outEdges.get(edge.from) ?? [];
        outs.push(edge);
        this.outEdges.set(edge.from, outs);

        const ins = this.inEdges.get(edge.targetId) ?? [];
        ins.push(edge);
        this.inEdges.set(edge.targetId, ins);
      }
    }
  }

  /** Does this ID exist in the bundle? */
  has(id: string): boolean {
    return this.nodesById.has(id.toUpperCase());
  }

  get(id: string): GraphArtifact | undefined {
    return this.nodesById.get(id.toUpperCase());
  }

  /** All artifact IDs in the bundle, sorted. */
  allIds(): string[] {
    return [...this.nodesById.keys()].sort();
  }

  /** All artifacts in the bundle, sorted by ID. */
  allArtifacts(): GraphArtifact[] {
    return this.allIds().map((id) => this.nodesById.get(id)!);
  }

  /** All IDs of an exact type (no polymorphism — see `idsSatisfying` for
   * the is-or-extends version). */
  idsOfType(typeName: string): string[] {
    return this.allArtifacts()
      .filter((a) => a.type === typeName)
      .map((a) => a.id);
  }

  /** All IDs whose type is-or-extends `typeName` (polymorphic, via the
   * profile registry's `satisfies`). Types unknown to the registry (KB-008
   * tolerance) are skipped rather than throwing. */
  idsSatisfying(typeName: string, registry: ProfileRegistry): string[] {
    return this.allArtifacts()
      .filter((a) => registry.has(a.type) && registry.satisfies(a.type, typeName))
      .map((a) => a.id);
  }

  /** Outgoing edges from `id` (this artifact's own `links:` entries),
   * optionally filtered to one relationship name. */
  outgoing(id: string, relationship?: string): GraphEdge[] {
    const edges = this.outEdges.get(id.toUpperCase()) ?? [];
    return relationship ? edges.filter((e) => e.relationship === relationship) : edges;
  }

  /** Reverse-index lookup: edges whose target is `id` — "who links to X" —
   * optionally filtered to one relationship name. */
  incoming(id: string, relationship?: string): GraphEdge[] {
    const edges = this.inEdges.get(id.toUpperCase()) ?? [];
    return relationship ? edges.filter((e) => e.relationship === relationship) : edges;
  }

  /** Every edge in the bundle carrying this relationship name, regardless of
   * source. Used by rules that reason about one relationship across the
   * whole graph (e.g. `link/cycles`). */
  edgesByRelationship(relationship: string): GraphEdge[] {
    const result: GraphEdge[] = [];
    for (const edges of this.outEdges.values()) {
      for (const edge of edges) {
        if (edge.relationship === relationship) result.push(edge);
      }
    }
    return result;
  }
}
