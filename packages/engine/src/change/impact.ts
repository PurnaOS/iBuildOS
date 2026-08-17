import type { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph } from "../graph/graph.js";
import { impact, type Impact } from "../graph/queries.js";

// SPEC.md area M (Live Change Management), CH-003 — "impact before action": on a
// proposed change, compute and present impact from the graph (TR-005) — affected
// stories (built, queued, in-flight), test cases, and everything else downstream —
// before anything is modified. This module does no traversal of its own: it calls
// `graph.impact()` (packages/engine/src/graph/queries.ts) for the actual forward/
// backward BFS and only classifies the resulting id sets by artifact type + status.
//
// Traversal direction: the shipped profile (docs/profile/*.md) models dependents as
// linking *up* to what they depend on (Story.implements -> Requirement, TestCase.verifies
// -> Requirement|Story|Bug, Task.parent -> Story, …). So "what does editing this
// Requirement/Story affect?" is exactly `impact().backward` — everything that (directly
// or transitively) links to the changed artifact. `impact().forward` is the changed
// artifact's own upstream context (e.g. the ProductBrief it traces_to) — exposed as-is,
// not further classified, since CH-003 only names downstream consequences.

/** A proposed edit to one requirement/story artifact. The graph walk only needs
 * `artifactId` — `before`/`after`/`changedFields` are free-form context carried through
 * into the report (and from there into `proposal.ts` / the Change artifact body, CH-002)
 * for a human or planner agent to read; the (text-agnostic) graph traversal never
 * inspects them. */
export interface ProposedEdit {
  artifactId: string;
  before?: string;
  after?: string;
  changedFields?: string[];
}

/** One backward-reachable artifact, described just enough to sort it into a bucket and
 * render it in a change-impact view. */
export interface AffectedArtifact {
  id: string;
  type: string;
  state?: string | undefined;
}

export interface ImpactReport {
  edit: ProposedEdit;
  /** The raw forward/backward id sets straight from `graph.impact()` — exposed
   * unclassified so callers can inspect (or re-classify) the underlying traversal
   * directly, alongside the buckets below. */
  raw: Impact;
  /** Backward-reachable WorkItem-satisfying artifacts already `done`/`accepted` — the
   * CH-005 "built against the old text" set that needs re-verification work. */
  completedStories: AffectedArtifact[];
  /** Backward-reachable WorkItem-satisfying artifacts in any other non-terminal state
   * (queued, building, review, or a type's own custom mid-pipeline state) — CH-007's
   * in-flight redirection candidates. */
  inFlightWork: AffectedArtifact[];
  /** Backward-reachable TestCase-satisfying artifacts not already retired — evidence
   * that may no longer match the (proposed) new text. */
  testCasesNeedingRevision: AffectedArtifact[];
  /** Everything else backward-reachable: not-yet-started or retired/rejected work,
   * retired test cases, releases, personas, and any type unknown to the registry.
   * Kept visible rather than silently dropped — CH-003 asks for the *whole* affected
   * set, not just the three named buckets. */
  otherAffected: AffectedArtifact[];
}

// Judgment calls (no chain-wide status vocabulary is fixed by FORMATS.md/docs/profile —
// each WorkItem subtype declares its own `states.vocabulary`, e.g. Epic has no
// "queued"/"building"/"review" and uses "active" instead): "done"/"accepted" reads as
// complete everywhere it appears; "draft"/"ready"/"retired"/"rejected" read as not
// (yet, or no longer) active work; anything else — "queued", "building", "review",
// "active", a project-defined custom state — is treated as in-flight, since it's neither
// of the other two.
const COMPLETED_STATES = new Set(["done", "accepted"]);
const DORMANT_STATES = new Set(["draft", "ready", "retired", "rejected"]);

function describe(graph: ArtifactGraph, id: string): AffectedArtifact {
  const artifact = graph.get(id);
  const state = artifact ? artifact.frontmatter.state : undefined;
  return {
    id,
    type: artifact?.type ?? "unknown",
    state: typeof state === "string" ? state : undefined,
  };
}

/** CH-003: compute and classify the impact of a proposed edit to `edit.artifactId`. */
export function computeChangeImpact(
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  edit: ProposedEdit,
): ImpactReport {
  const raw = impact(graph, edit.artifactId);

  const completedStories: AffectedArtifact[] = [];
  const inFlightWork: AffectedArtifact[] = [];
  const testCasesNeedingRevision: AffectedArtifact[] = [];
  const otherAffected: AffectedArtifact[] = [];

  for (const id of [...raw.backward].sort()) {
    const artifact = graph.get(id);
    const described = describe(graph, id);

    if (!artifact || !registry.has(artifact.type)) {
      otherAffected.push(described);
      continue;
    }

    if (registry.satisfies(artifact.type, "TestCase")) {
      (described.state !== "retired" ? testCasesNeedingRevision : otherAffected).push(described);
      continue;
    }

    if (registry.satisfies(artifact.type, "WorkItem")) {
      const state = described.state;
      if (!state) {
        otherAffected.push(described);
      } else if (COMPLETED_STATES.has(state)) {
        completedStories.push(described);
      } else if (DORMANT_STATES.has(state)) {
        otherAffected.push(described);
      } else {
        inFlightWork.push(described);
      }
      continue;
    }

    otherAffected.push(described);
  }

  return { edit, raw, completedStories, inFlightWork, testCasesNeedingRevision, otherAffected };
}
