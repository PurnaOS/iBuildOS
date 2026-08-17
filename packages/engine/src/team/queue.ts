import { ArtifactGraph, isRecord } from "../graph/graph.js";

// SPEC TM-003/TM-004 — assignment + "my queue". A user's personal queue is
// everything they own, are the assignee on, or hold a pending `claim` for
// (FORMATS.md §4's common frontmatter keys). Pure query over an
// `ArtifactGraph` — build one from a plain artifact list via
// `new ArtifactGraph(artifacts)` (graph/graph.js's own constructor) when
// there's no graph already in hand; this module adds no separate
// list-scanning path.

export type QueueReason = "owner" | "assignee" | "claim";

export interface QueueEntry {
  artifactId: string;
  type: string;
  /** Every reason this artifact is in the queue — an artifact can be both
   * owned and claimed, etc. Checked in this order: owner, assignee, claim. */
  reasons: QueueReason[];
}

export interface MyQueueOptions {
  /**
   * Team IDs (`TM-…`) the user belongs to. Ownership/assignment to any of
   * these teams also lands the artifact in the user's queue — FORMATS.md
   * §4 says `owner`/`assignee` hold either a `US-…` or `TM-…` id. Pass
   * explicitly, or derive them from `Team.members` already in the graph
   * via `teamsForUser`. `claim` (FORMATS §4/§5, `{by, machine, at}`) is
   * always a single `US-…` id, so it never matches a team.
   */
  teamIds?: readonly string[];
}

/** Every `Team` artifact in the graph whose `members` list includes
 * `userId` (case-insensitive on input, canonical uppercase per FORMATS
 * §2). Sorted, deduped. */
export function teamsForUser(graph: ArtifactGraph, userId: string): string[] {
  const uid = userId.toUpperCase();
  const teamIds = new Set<string>();

  for (const artifact of graph.allArtifacts()) {
    if (artifact.type !== "Team") continue;
    const members = artifact.frontmatter.members;
    if (!Array.isArray(members)) continue;
    if (members.some((member) => typeof member === "string" && member.toUpperCase() === uid)) {
      teamIds.add(artifact.id);
    }
  }

  return [...teamIds].sort();
}

/**
 * A user's personal queue (TM-004): every artifact they own, are the
 * assignee on, or hold a pending `claim` on. Results are in the same
 * ID-sorted order as `ArtifactGraph.allArtifacts()` — deterministic
 * regardless of the input artifact order.
 */
export function myQueue(
  graph: ArtifactGraph,
  userId: string,
  options: MyQueueOptions = {},
): QueueEntry[] {
  const uid = userId.toUpperCase();
  const identities = new Set([uid, ...(options.teamIds ?? []).map((id) => id.toUpperCase())]);

  const entries: QueueEntry[] = [];
  for (const artifact of graph.allArtifacts()) {
    const fm = artifact.frontmatter;
    const reasons: QueueReason[] = [];

    if (typeof fm.owner === "string" && identities.has(fm.owner.toUpperCase())) {
      reasons.push("owner");
    }
    if (typeof fm.assignee === "string" && identities.has(fm.assignee.toUpperCase())) {
      reasons.push("assignee");
    }
    if (isRecord(fm.claim) && typeof fm.claim.by === "string" && fm.claim.by.toUpperCase() === uid) {
      reasons.push("claim");
    }

    if (reasons.length > 0) {
      entries.push({ artifactId: artifact.id, type: artifact.type, reasons });
    }
  }

  return entries;
}
