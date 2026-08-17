import type { ArtifactGraph } from "../graph/graph.js";
import { compareStrings } from "./shared.js";

// IN-008 — human workload view (ties to TM): count of owned/assigned
// artifacts per user/team, using the `owner` (every artifact) and
// `assignee` (work types only, FORMATS.md §4) frontmatter fields already on
// the graph's nodes. Purely derived — no separate workload store.

export type WorkloadRole = "owner" | "assignee";

export interface WorkloadEntry {
  /** A `US-…`/`TM-…` id, or whatever string value the field carries. */
  id: string;
  role: WorkloadRole;
  count: number;
  /** Sorted, deduped artifact IDs contributing to `count`. */
  artifactIds: string[];
}

export interface WorkloadOptions {
  /** Identity IDs (e.g. every User/Team artifact's ID in the bundle) to
   * include as a zero-count row even when they own/are assigned nothing —
   * without this, an idle team member simply doesn't appear in the result
   * at all, which is indistinguishable from "unknown to the project". */
  identities?: readonly string[];
}

function tally(
  graph: ArtifactGraph,
  field: "owner" | "assignee",
  identities: readonly string[],
): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const artifact of graph.allArtifacts()) {
    const value = artifact.frontmatter[field];
    if (typeof value !== "string" || value.length === 0) continue;
    const list = byId.get(value) ?? [];
    list.push(artifact.id);
    byId.set(value, list);
  }
  for (const id of identities) {
    if (!byId.has(id)) byId.set(id, []);
  }
  return byId;
}

function toEntries(byId: Map<string, string[]>, role: WorkloadRole): WorkloadEntry[] {
  return [...byId.entries()]
    .map(([id, artifactIds]) => ({
      id,
      role,
      count: artifactIds.length,
      artifactIds: [...artifactIds].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.id, b.id));
}

/** Owner and assignee counts across every artifact in the graph. Returns one
 * row per (id, role) pair that has at least one artifact, plus a zero-count
 * row for every id in `options.identities` that otherwise wouldn't appear. */
export function workload(graph: ArtifactGraph, options: WorkloadOptions = {}): WorkloadEntry[] {
  const identities = options.identities ?? [];
  const owners = tally(graph, "owner", identities);
  const assignees = tally(graph, "assignee", identities);
  return [...toEntries(owners, "owner"), ...toEntries(assignees, "assignee")];
}
