import { resolveSeverity, type Finding, type Transition } from "@ibuildos/schemas";
import type { ProfileRegistry, ResolvedType } from "../profile/registry.js";
import { ArtifactGraph, baseArtifactId } from "../graph/graph.js";

// FORMATS.md §6 — the state/* rule family, built on `ResolvedType.states`
// (§5's `states.vocabulary`/`transitions`/`derived`).
//
// Simplifying assumption (documented once, applies to legal/approved/
// derived below): "last transition ∈ declared transitions" is inherently a
// before/after question, and these rule functions only ever see one
// snapshot of an artifact's frontmatter — they have no git history. So each
// of these three checks takes an explicit `previousState: string | null`
// parameter; the caller (the gate evaluator, built by a parallel work
// package, presumably from a git diff of the artifact's `state` field) is
// responsible for supplying it. `previousState: null` means "no prior state
// is known" (e.g. a brand-new artifact, or the evaluator didn't compute a
// diff) — these checks pass trivially rather than guess.

function findTransition(
  transitions: readonly Transition[],
  from: string,
  to: string,
): Transition | undefined {
  return transitions.find((t) => {
    const matchesFrom =
      t.from === "*" || t.from === from || (Array.isArray(t.from) && t.from.includes(from));
    return matchesFrom && t.to === to;
  });
}

/** `state/vocabulary` — `state` must be one of the type's declared values. */
export function checkStateVocabulary(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  context?: string,
): Finding[] {
  const vocabulary = type.states?.vocabulary;
  if (!vocabulary) return []; // no states declared for this type — nothing to check

  const current = frontmatter.state;
  if (typeof current === "string" && vocabulary.includes(current)) return [];

  return [
    {
      rule: "state/vocabulary",
      severity: resolveSeverity("state/vocabulary", context),
      artifact: artifactId,
      subject: "state",
      message: `state "${String(current)}" is not in type "${type.name}"'s vocabulary [${vocabulary.join(", ")}]`,
    },
  ];
}

/** `state/legal` — the transition from `previousState` to the current
 * `state` must be one of the type's declared transitions (`from` may be a
 * single state, a list, or `"*"`). No-op when `previousState` is null or
 * equals the current state (no transition occurred). */
export function checkStateLegal(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  previousState: string | null,
  context?: string,
): Finding[] {
  if (previousState === null) return [];
  const current = typeof frontmatter.state === "string" ? frontmatter.state : undefined;
  if (!current || !type.states) return [];
  if (previousState === current) return [];

  const transition = findTransition(type.states.transitions, previousState, current);
  if (transition) return [];

  return [
    {
      rule: "state/legal",
      severity: resolveSeverity("state/legal", context),
      artifact: artifactId,
      subject: "state",
      message: `illegal transition "${previousState}" -> "${current}" for type "${type.name}" (FORMATS.md §5/§6)`,
    },
  ];
}

/** `state/approved` — a transition that declares `approval: <mode>` needs an
 * accepted (or dial-waived, D-115) Review artifact whose `subject` is this
 * artifact's ID. `Review.subject` is a single ID (FORMATS §9), so this is a
 * direct equality check, not a link/graph traversal from this artifact's own
 * `links:` block. */
export function checkStateApproved(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  previousState: string | null,
  context?: string,
): Finding[] {
  if (previousState === null) return [];
  const current = typeof frontmatter.state === "string" ? frontmatter.state : undefined;
  if (!current || !type.states) return [];
  if (previousState === current) return [];

  const transition = findTransition(type.states.transitions, previousState, current);
  if (!transition?.approval) return [];

  const hasApproval = graph.allArtifacts().some((a) => {
    if (!registry.has(a.type) || !registry.satisfies(a.type, "Review")) return false;
    if (typeof a.frontmatter.subject !== "string") return false;
    if (baseArtifactId(a.frontmatter.subject) !== artifactId.toUpperCase()) return false;
    const verdict = a.frontmatter.verdict;
    return verdict === "accepted" || verdict === "waived";
  });
  if (hasApproval) return [];

  return [
    {
      rule: "state/approved",
      severity: resolveSeverity("state/approved", context),
      artifact: artifactId,
      subject: "state",
      message: `transition "${previousState}" -> "${current}" requires approval "${transition.approval}" but no accepted/waived Review targets ${artifactId}`,
    },
  ];
}

/** `state/derived` (warn) — states the type marks `derived: true` are
 * computed by the engine (RQ-008); a hand-edit is a violation. Given only a
 * snapshot, this can't distinguish "the engine just computed this" from "a
 * human/agent hand-edited it" — it flags every observed transition into a
 * derived-state type and leaves it to the evaluator to skip calling this
 * check for a transition it just performed itself. */
export function checkStateDerived(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  previousState: string | null,
  context?: string,
): Finding[] {
  if (!type.states?.derived) return [];
  if (previousState === null) return [];
  const current = typeof frontmatter.state === "string" ? frontmatter.state : undefined;
  if (!current || current === previousState) return [];

  return [
    {
      rule: "state/derived",
      severity: resolveSeverity("state/derived", context),
      artifact: artifactId,
      subject: "state",
      message: `state changed "${previousState}" -> "${current}" but type "${type.name}" marks states as engine-derived (RQ-008) — confirm this was engine-computed, not hand-edited`,
    },
  ];
}
