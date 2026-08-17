import {
  RULE_REGISTRY,
  resolveSeverity,
  type Finding,
  type GatesFile,
} from "@ibuildos/schemas";

// FORMATS.md §6 — gate composition engine. Expands a named gate (docs/profile/
// gates.yaml) into its concrete, deduplicated rule-ID list, then runs those
// rules against caller-supplied checkers. This module knows nothing about how
// any individual rule id/glob (`doc/field-required`, `link/target-exists`, …)
// is actually checked — that's the caller's job (see `RuleChecker` below) —
// so it stays decoupled from every other rule-implementation work package.

export class GateCompositionError extends Error {}

/** A gate entry after its `?scope=` modifier (if any) has been parsed off. */
export interface ExpandedRule {
  ruleId: string;
  /**
   * `stream | release | changed | all`, parsed off a `?scope=` suffix (on the
   * rule id itself, or inherited from an enclosing composed gate that carried
   * one, e.g. `release-deploy: [merge?scope=release, ...]`).
   *
   * TODO(gates): this is currently informational only. Real "resolve `scope`
   * against the actual changed-files/stream/release set" filtering is later
   * work — the evaluator does not filter `artifacts` by it. Callers that care
   * about scope must pre-filter the `artifacts` they pass to `evaluateGate`.
   */
  scope?: string | undefined;
}

interface ParsedEntry {
  base: string;
  scope?: string | undefined;
}

function parseScopeModifier(entry: string): ParsedEntry {
  const marker = "?scope=";
  const idx = entry.indexOf(marker);
  if (idx === -1) return { base: entry };
  return { base: entry.slice(0, idx), scope: entry.slice(idx + marker.length) };
}

function addExpanded(
  out: ExpandedRule[],
  seen: Set<string>,
  ruleId: string,
  scope: string | undefined,
): void {
  if (seen.has(ruleId)) return; // first occurrence wins (deduplicated by rule id)
  seen.add(ruleId);
  out.push(scope === undefined ? { ruleId } : { ruleId, scope });
}

function expandGateInternal(
  gateName: string,
  gatesFile: GatesFile,
  allRuleIds: readonly string[],
  path: readonly string[],
  out: ExpandedRule[],
  seen: Set<string>,
  inheritedScope: string | undefined,
): void {
  if (path.includes(gateName)) {
    throw new GateCompositionError(
      `cyclic gate composition: ${[...path, gateName].join(" -> ")} (docs/profile/gates.yaml)`,
    );
  }

  const list = gatesFile.gates[gateName];
  if (!list) {
    throw new GateCompositionError(
      `unknown gate "${gateName}" — not defined in docs/profile/gates.yaml`,
    );
  }

  const nextPath = [...path, gateName];

  for (const entry of list) {
    const { base, scope } = parseScopeModifier(entry);
    const effectiveScope = scope ?? inheritedScope;

    if (base in gatesFile.gates) {
      expandGateInternal(base, gatesFile, allRuleIds, nextPath, out, seen, effectiveScope);
      continue;
    }

    if (base.endsWith("/*")) {
      const prefix = base.slice(0, -1); // keep the trailing "/"
      const matches = allRuleIds.filter((id) => id.startsWith(prefix));
      if (matches.length === 0) {
        throw new GateCompositionError(
          `gate "${gateName}" glob "${base}" matches no known rule id (RULE_REGISTRY)`,
        );
      }
      for (const id of matches) addExpanded(out, seen, id, effectiveScope);
      continue;
    }

    if (allRuleIds.includes(base)) {
      addExpanded(out, seen, base, effectiveScope);
      continue;
    }

    throw new GateCompositionError(
      `gate "${gateName}" references unknown rule or gate "${base}" (not in RULE_REGISTRY and not a gate name)`,
    );
  }
}

/**
 * Expand a named gate into its concrete, deduplicated list of rule ids —
 * resolving `prefix/*` globs against `RULE_REGISTRY` and recursively
 * expanding gate-name compositions. Throws `GateCompositionError` on an
 * unknown gate/rule reference or a cyclic composition.
 */
export function expandGate(gateName: string, gatesFile: GatesFile): ExpandedRule[] {
  const allRuleIds = Object.keys(RULE_REGISTRY);
  const out: ExpandedRule[] = [];
  const seen = new Set<string>();
  expandGateInternal(gateName, gatesFile, allRuleIds, [], out, seen, undefined);
  return out;
}

/** One artifact to evaluate a gate's rules against. Deliberately minimal —
 * this package doesn't know about OKF documents, ResolvedTypes, etc.; callers
 * adapt whatever artifact representation they have into this shape. */
export interface ArtifactInput {
  id: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}

/** A single rule's check function, supplied by the caller. Not implemented
 * here — see the module doc comment. */
export type RuleChecker = (artifact: ArtifactInput) => Finding[];

export interface EvaluateGateOptions {
  /** Rule id -> checker. A rule expanded from the gate with no entry here is
   * silently skipped (the caller hasn't wired that rule up yet) rather than
   * treated as an error — gate evaluation is expected to run with a partial
   * rule set while sibling rule-implementation work is still in flight. */
  ruleCheckers: Record<string, RuleChecker>;
  artifacts: ArtifactInput[];
}

/**
 * Evaluate a named gate: expand it, run every artifact through every
 * expanded rule id's checker (if the caller supplied one), and re-stamp each
 * resulting finding's severity via `resolveSeverity(ruleId, gateName)` — this
 * is what elevates e.g. `chain/story-untested` from `warn` to `error` when
 * evaluated as part of `merge` (FORMATS §6's `error@merge` notation).
 *
 * Output is sorted by (artifact, rule, subject) for determinism — this
 * package follows CLAUDE.md's "deterministic first" rule even though nothing
 * here touches the filesystem.
 */
export function evaluateGate(
  gateName: string,
  gatesFile: GatesFile,
  options: EvaluateGateOptions,
): Finding[] {
  const expanded = expandGate(gateName, gatesFile);
  const findings: Finding[] = [];

  for (const { ruleId } of expanded) {
    const checker = options.ruleCheckers[ruleId];
    if (!checker) continue;

    for (const artifact of options.artifacts) {
      for (const finding of checker(artifact)) {
        findings.push({ ...finding, severity: resolveSeverity(finding.rule, gateName) });
      }
    }
  }

  return findings.sort(
    (a, b) =>
      a.artifact.localeCompare(b.artifact) ||
      a.rule.localeCompare(b.rule) ||
      a.subject.localeCompare(b.subject),
  );
}
