import type { ArtifactGraph } from "../graph/graph.js";
import { compareStrings } from "./shared.js";

// IN-001 — progress dashboard: completed vs. pending counts by artifact
// type/state, derived purely from the artifact set already loaded into an
// `ArtifactGraph` (no git history — that's IN-003's job, over a sequence of
// bundles this module doesn't know about). The caller decides what set of
// artifacts (a whole project, one changed scope, ...) the graph was built
// from before calling this.
//
// Frontmatter's status key is `state`, not `status` (FORMATS.md §4) — every
// read below goes through `frontmatter.state`.

/** The shipped default profile's own convention for "reached a terminal,
 * positive state" (SPEC.md §11: Story/Task/Epic → `done`, Requirement →
 * `verified`, Decision → `accepted`). This is deliberately NOT derived from
 * `TypeDefinition.states` — a type's transition list doesn't distinguish a
 * "success" edge from a "still open" one (Story declares `{ from:
 * [accepted, done], to: review }`, so `done` is not a dead end) and
 * vocabulary array order carries no such meaning either (see
 * `docs/profile/story.md`, `task.md`, `requirement.md`, `decision.md`).
 * Exported so a project on a different profile can override it — every
 * function here takes the set as an optional parameter. */
export const DEFAULT_COMPLETED_STATES: ReadonlySet<string> = new Set(["done", "verified", "accepted"]);

export interface ProgressCount {
  type: string;
  state: string;
  count: number;
}

export interface ProgressSummary {
  /** Total artifacts in the graph. */
  total: number;
  /** Count per type, regardless of state. */
  byType: Record<string, number>;
  /** Count per state, regardless of type. */
  byState: Record<string, number>;
  /** The full type x state crosstab, sorted by type then state. */
  byTypeAndState: ProgressCount[];
  /** Per type, how many artifacts are in a "completed" state
   * (`completedStates`, default `DEFAULT_COMPLETED_STATES`). */
  completedByType: Record<string, number>;
  /** Per type, everything else (`total - completed`) — draft, building,
   * rejected, retired, ... all lumped as "pending" for this dashboard. */
  pendingByType: Record<string, number>;
}

const NO_STATE = "(no state)";

export function progress(
  graph: ArtifactGraph,
  completedStates: ReadonlySet<string> = DEFAULT_COMPLETED_STATES,
): ProgressSummary {
  const artifacts = graph.allArtifacts();
  const byType: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const crosstab = new Map<string, number>(); // `${type}\0${state}` -> count
  const completedByType: Record<string, number> = {};

  for (const artifact of artifacts) {
    const state = typeof artifact.frontmatter.state === "string" ? artifact.frontmatter.state : NO_STATE;

    byType[artifact.type] = (byType[artifact.type] ?? 0) + 1;
    byState[state] = (byState[state] ?? 0) + 1;

    const key = `${artifact.type}\0${state}`;
    crosstab.set(key, (crosstab.get(key) ?? 0) + 1);

    if (completedStates.has(state)) {
      completedByType[artifact.type] = (completedByType[artifact.type] ?? 0) + 1;
    }
  }

  const byTypeAndState: ProgressCount[] = [...crosstab.entries()]
    .map(([key, count]): ProgressCount => {
      const [type, state] = key.split("\0") as [string, string];
      return { type, state, count };
    })
    .sort((a, b) => (a.type === b.type ? compareStrings(a.state, b.state) : compareStrings(a.type, b.type)));

  const pendingByType: Record<string, number> = {};
  for (const type of Object.keys(byType)) {
    pendingByType[type] = byType[type]! - (completedByType[type] ?? 0);
  }

  return {
    total: artifacts.length,
    byType,
    byState,
    byTypeAndState,
    completedByType,
    pendingByType,
  };
}
