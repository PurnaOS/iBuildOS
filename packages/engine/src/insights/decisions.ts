import type { ArtifactGraph } from "../graph/graph.js";
import { impact, whoLinksTo } from "../graph/queries.js";
import { compareStrings, sortedUnique } from "./shared.js";

// DA-001/DA-002 — Decision `constrains` and `supersedes` traceability, built
// entirely on `graph/queries.ts` primitives (`impact`, `whoLinksTo`); nothing
// here re-walks `links` by hand.

/** What a Decision (or any `constrains`-typed source) directly governs —
 * `docs/profile/decision.md`: `constrains: { target: [Requirement, Story,
 * Architecture] }` (DA-001). */
export function constrainedArtifacts(graph: ArtifactGraph, decisionId: string): string[] {
  return sortedUnique(graph.outgoing(decisionId, "constrains").map((edge) => edge.targetId));
}

/** The inverse: which Decisions constrain a given artifact — DA-002's "an
 * artifact constrained by a decision shall show it." Thin, domain-named
 * rename of `whoLinksTo`, which already returns sorted, deduped IDs. */
export function constrainingDecisions(graph: ArtifactGraph, artifactId: string): string[] {
  return whoLinksTo(graph, artifactId, "constrains");
}

export interface SupersessionHistory {
  /** What this artifact supersedes, transitively (older Decisions/
   * Requirements it replaced). */
  supersedes: string[];
  /** What supersedes this artifact, transitively (its eventual replacement
   * chain, if any). */
  supersededBy: string[];
}

/** Full supersession chain for a Decision or Requirement (`supersedes:
 * Decision -> Decision, Requirement -> Requirement` per SPEC.md §11's
 * relationship table) — a thin, domain-named wrapper over `impact()`'s
 * forward/backward reachability restricted to the `supersedes`
 * relationship, so a multi-hop supersession chain (A superseded by B
 * superseded by C) resolves in one call. */
export function supersessionHistory(graph: ArtifactGraph, id: string): SupersessionHistory {
  const result = impact(graph, id, "supersedes");
  return {
    supersedes: [...result.forward].sort(compareStrings),
    supersededBy: [...result.backward].sort(compareStrings),
  };
}
