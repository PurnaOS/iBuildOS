import type { Finding } from "@ibuildos/schemas";
import {
  checkIdFormat,
  checkFieldRequired,
  checkFieldKind,
  checkSectionRequired,
  checkCriteriaItems,
  checkLinkTargetExists,
  checkLinkTargetType,
  checkLinkCardinality,
  checkLinkCycles,
  checkStateVocabulary,
  checkCommittedSecret,
  checkTodoMarker,
  checkIdDuplicate,
  checkIdProvisionalOnTrunk,
  type ArtifactInput,
  type RuleChecker,
  type ResolvedType,
} from "@ibuildos/engine";
import type { LoadedBundle } from "../bundle/load.js";

// FORMATS.md §6 lists ~34 rule ids. This CLI wires up the subset that's
// either exercised by its own fixtures or has no external dependency the
// bundle load can't already supply (a whole-repo file listing for scoping,
// a bound TestResult store, a git-diff-derived previousState, machine-local
// trusted-hash storage, …). The rest are a documented, reportable gap for a
// later work package rather than something half-wired here:
//
//   state/legal, state/approved, state/derived — need `previousState`, which
//     only a git-history diff of the artifact's own `state` field can supply;
//     a bundle load sees one snapshot, and each of these three no-ops on
//     `previousState: null` anyway (see rules/state.ts's own doc comment),
//     so "wiring" them against a bundle-only load would silently never fire.
//   chain/req-unimplemented, chain/story-untested, chain/task-no-code,
//   chain/code-unlinked, chain/done-honest, chain/bug-regression — need
//     either a repo-wide tracked-file listing (`allFiles`) or a TestResult
//     evidence store; out of scope for this pass (see the CLI README gap
//     note).
//   evid/tests-passing, evid/stale — need a TestResult lookup / staleness
//     policy this CLI doesn't own yet.
//   contract/valid, contract/trusted — need `ibuildos.yaml`'s `contract:`
//     section plus, for `contract/trusted`, machine-local trusted-hash
//     storage that doesn't exist yet.
//   merge/* — need merge-queue/stream state no headless bundle load has.
//   guidance/stale — needs AGENTS.md export/profile-change timestamps this
//     CLI doesn't track.
//   doc/body-link — needs an injected repo-relative link-existence check;
//     deferred, not because it's hard, just not built this pass.
//
// `pin/engine`/`pin/profile` are handled separately (src/pin-check.ts) as a
// pre-flight refusal (FORMATS §12 exit code 3), not a per-artifact checker.

function artifactType(artifact: ArtifactInput): string | undefined {
  return typeof artifact.frontmatter.type === "string" ? artifact.frontmatter.type : undefined;
}

/**
 * Build the per-artifact `RuleChecker` map both `validate` (run directly,
 * once per artifact) and `gate <name>` (via `evaluateGate`, which re-stamps
 * severity per the gate name — FORMATS §6's "error@merge" notation) share.
 * A rule checker for a type the loaded profile can't resolve returns `[]`
 * rather than a finding — an artifact of an unknown type is `link/target-
 * type`'s own "unknown type tolerated" stance (rules/links.ts) applied
 * consistently to every type-driven rule here, not a literal FORMATS rule.
 */
export function buildRuleCheckers(bundle: LoadedBundle): Record<string, RuleChecker> {
  const { graph, profile } = bundle;
  const { registry } = profile;

  function resolveType(artifact: ArtifactInput): ResolvedType | undefined {
    const typeName = artifactType(artifact);
    if (!typeName || !registry.has(typeName)) return undefined;
    try {
      return registry.resolve(typeName);
    } catch {
      return undefined;
    }
  }

  return {
    "id/format": (artifact) => checkIdFormat(artifact.id),

    "doc/field-required": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkFieldRequired(artifact.id, artifact.frontmatter, type) : [];
    },

    "doc/field-kind": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkFieldKind(artifact.id, artifact.frontmatter, type) : [];
    },

    "doc/section-required": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkSectionRequired(artifact.id, artifact.body ?? "", type) : [];
    },

    "doc/criteria-items": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkCriteriaItems(artifact.id, artifact.body ?? "", type) : [];
    },

    "link/target-exists": (artifact) =>
      checkLinkTargetExists(artifact.id, artifact.frontmatter, graph),

    "link/target-type": (artifact) => {
      const type = resolveType(artifact);
      return type
        ? checkLinkTargetType(artifact.id, artifact.frontmatter, type, graph, registry)
        : [];
    },

    "link/cardinality": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkLinkCardinality(artifact.id, artifact.frontmatter, type) : [];
    },

    "state/vocabulary": (artifact) => {
      const type = resolveType(artifact);
      return type ? checkStateVocabulary(artifact.id, artifact.frontmatter, type) : [];
    },

    "sec/committed-secret": (artifact) =>
      checkCommittedSecret(artifact.id, artifact.frontmatter, artifact.body ?? ""),

    "docs/todo-marker": (artifact) => checkTodoMarker(artifact.id, artifact.body ?? ""),
  };
}

/** Rule ids `buildRuleCheckers` wires up — used to filter a gate's expanded
 * rule list down to what this CLI can actually evaluate, and to build
 * `validate`'s flat finding list without going through `evaluateGate`. */
export const WIRED_PER_ARTIFACT_RULES = [
  "id/format",
  "doc/field-required",
  "doc/field-kind",
  "doc/section-required",
  "doc/criteria-items",
  "link/target-exists",
  "link/target-type",
  "link/cardinality",
  "state/vocabulary",
  "sec/committed-secret",
  "docs/todo-marker",
] as const;

/** Rule ids checked once across the whole bundle rather than per artifact —
 * `id/duplicate` and `id/provisional-on-trunk` must see the raw parsed list
 * (never `graph.allArtifacts()` — see rules/doc-structure.ts's warning: the
 * graph is last-write-wins on a duplicate id, which would make the duplicate
 * unobservable), and `link/cycles` and `profile/meta-valid` are inherently
 * whole-bundle checks. */
export const WIRED_BUNDLE_WIDE_RULES = [
  "id/duplicate",
  "id/provisional-on-trunk",
  "link/cycles",
  "profile/meta-valid",
] as const;

export function bundleWideFindings(bundle: LoadedBundle): Finding[] {
  const { artifacts, graph, profile } = bundle;
  return [
    ...profile.metaFindings,
    ...checkIdDuplicate(artifacts),
    ...checkIdProvisionalOnTrunk(artifacts),
    ...checkLinkCycles(graph, profile.registry),
  ];
}
