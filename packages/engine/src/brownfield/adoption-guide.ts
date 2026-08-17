// SPEC.md BF-009 (team adoption guide): "Brownfield adoption shall generate a maintained
// team-facing adoption guide artifact — what is changing and why, the new gate and review
// expectations, how the baseline (VG-008) is handled, and the staged rollout plan (BF-005) —
// distinct from individual onboarding (PS-015), so a whole team aligns on the process change
// rather than discovering it piecemeal."
//
// Scope decision: none of `docs/profile/*.md`'s 27 concrete types is a fit for this content.
// `Runbook` (DA-004) is the closest "guide"-shaped type, but its own type-profile doc is
// explicit that it's operational knowledge ("how to run, roll back, investigate") "linked to
// deploy targets and surfaced beside deploy/trunk-broken flows" — a different audience and
// purpose than a one-time, team-wide process/rollout communication. `ProductBrief` is vision,
// not process; `Decision` is a single ratified choice with `constrains`/`supersedes` links,
// not a living guide; `Milestone`/`Release` are time/version markers. Every type's `body:
// sections: []` means none of them impose structure this content would benefit from over
// plain markdown anyway. So this generates plain markdown, not a typed OKF document — a later
// round can wrap it in whatever type the profile grows for this purpose (or leave it as a
// plain repo file, e.g. `ADOPTION.md`, which is itself a defensible shape for a document
// meant to be read by an entire team before any tooling is involved).

export interface AdoptionGuideBaselineSummary {
  /** Total baseline entries recorded (VG-008's committed accepted-debt count). */
  entries: number;
  /** Findings-report-shaped severity breakdown of what was baselined, if available. */
  errors?: number;
  warnings?: number;
  info?: number;
}

export interface AdoptionGuideInput {
  /** The project's display name. */
  projectName: string;
  /** Declared in-scope path globs/areas (BF-005), e.g. `["src/legacy/**", "docs/**"]`. */
  scopeAreas: readonly string[];
  /** Day-one baseline summary (BF-006/VG-008) — pair with `generateInitialBaseline`'s output. */
  baseline: AdoptionGuideBaselineSummary;
  /** ISO-8601 date (`YYYY-MM-DD`); defaults to today. */
  generatedAt?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatScopeAreas(scopeAreas: readonly string[]): string {
  if (scopeAreas.length === 0) {
    return "- (no paths declared in scope yet — adoption has not started)\n";
  }
  return scopeAreas.map((area) => `- \`${area}\``).join("\n") + "\n";
}

function formatBaselineSummary(baseline: AdoptionGuideBaselineSummary): string {
  const lines = [`- **${baseline.entries}** pre-existing findings accepted into the baseline.`];
  if (
    baseline.errors !== undefined ||
    baseline.warnings !== undefined ||
    baseline.info !== undefined
  ) {
    const errors = baseline.errors ?? 0;
    const warnings = baseline.warnings ?? 0;
    const info = baseline.info ?? 0;
    lines.push(`- Breakdown: ${errors} error(s), ${warnings} warning(s), ${info} info.`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Generate the markdown body of a team-facing adoption guide (BF-009) from basic project
 * info: name, in-scope areas (BF-005), and a day-one baseline summary (BF-006/VG-008). Pure
 * and template-driven — no I/O, no AI. Callers decide where the result is written (e.g. a
 * repo-root `ADOPTION.md`, or a future typed artifact once the profile grows one for this).
 */
export function generateAdoptionGuide(input: AdoptionGuideInput): string {
  const generatedAt = input.generatedAt ?? todayIsoDate();

  return `# ${input.projectName} — iBuildOS Adoption Guide

_Generated ${generatedAt}._

This guide is for the whole team, not just whoever ran adoption. It explains what is changing,
why, and what to expect from the gate from now on.

## What's changing, and why

${input.projectName} is adopting iBuildOS: requirements, stories, and tasks trace through code
to tests as version-controlled documents living in this repository, and a deterministic
validation gate checks that chain on every change. Nothing about how the codebase already works
is being rewritten or reformatted to make this happen (BF-002) — adoption only adds documents,
profile, contract, and configuration alongside what is already here.

## In-scope areas

Adoption is scoped to specific paths, expanding over time (BF-005). The gate enforces strictly
inside adopted scope and stays silent outside it — code and docs outside the list below are not
yet held to the new standard.

${formatScopeAreas(input.scopeAreas)}
As more of the repo is adopted, this list grows and the gate's reach grows with it. Expanding
scope is itself recorded as a scope-expansion event, so debt burndown reporting can tell "newly
adopted" apart from "regression."

## Baseline: how existing debt is handled

Initial validation debt is baselined on day one so the gate is useful immediately without
blocking on pre-existing issues (BF-006, VG-008):

${formatBaselineSummary(input.baseline)}
From here, the baseline can only shrink (or grow when scope expands, always with a recorded
scope-expansion event) — pre-existing findings stay quiet, but no new violation of the same
kind can be added and treated as already-accepted. Burndown is visible over time.

## Gate & review expectations

- Every change is checked against the same deterministic gate everyone else's changes are
  checked against — no exceptions for "this part is old code."
- A red gate blocks the same way it would on a greenfield project; nothing about the review
  bar changes because a file predates adoption, once that file is in scope.
- New work inside adopted scope is held to the full standard from the moment it lands; only
  pre-existing findings recorded in the baseline are exempt, and only until they're touched.

## Staged rollout plan

Adoption proceeds by expanding the in-scope area list above, one area at a time, rather than
attempting the whole repo at once. Each expansion: baselines that area's existing debt, turns
the gate on for it, and is recorded as its own scope-expansion event for burndown reporting.
Talk to whoever is driving adoption before treating an out-of-scope area as covered — until it
appears in the list above, the gate is intentionally silent there.
`;
}
