import { z } from "zod";
import { SeveritySchema, type Finding } from "./findings.js";

// FORMATS.md §6 — the canonical rule registry. Rule IDs are frozen; new rules
// append (never renumber/rename). This is the single source of truth for
// each rule's severity, consulted by every rule-implementation module so two
// independently-built rules can't silently disagree about their own
// severity.
//
// Some rules are context-qualified in FORMATS §6 ("error@merge",
// "error@gates", "error (CI) / warn (UI)") rather than a flat severity —
// `overrides` captures that, keyed by gate name ("merge", "gates") or
// evaluator context ("ci", "ui"). Where FORMATS doesn't state the severity
// outside that qualified context, `defaultSeverity` is set to `"warn"` (a
// documented assumption, not a spec fact) so the rule still surfaces
// somewhere rather than going silent.

export const RuleMetadataSchema = z.object({
  id: z.string(),
  defaultSeverity: SeveritySchema,
  overrides: z.record(z.string(), SeveritySchema).optional(),
});

export type RuleMetadata = z.infer<typeof RuleMetadataSchema>;

function rule(
  id: string,
  defaultSeverity: RuleMetadata["defaultSeverity"],
  overrides?: RuleMetadata["overrides"],
): RuleMetadata {
  return overrides ? { id, defaultSeverity, overrides } : { id, defaultSeverity };
}

export const RULE_REGISTRY: Record<string, RuleMetadata> = Object.fromEntries(
  [
    rule("doc/field-required", "error"),
    rule("doc/field-kind", "error"),
    rule("doc/section-required", "error"),
    rule("doc/criteria-items", "error"),
    rule("doc/body-link", "warn"),
    rule("id/format", "error"),
    rule("id/duplicate", "error"),
    rule("id/provisional-on-trunk", "error"),
    rule("link/target-exists", "error"),
    rule("link/target-type", "error"),
    rule("link/cardinality", "error"),
    rule("link/cycles", "error"),
    rule("state/vocabulary", "error"),
    rule("state/legal", "error"),
    rule("state/approved", "error"),
    rule("state/derived", "warn"),
    rule("chain/req-unimplemented", "warn"),
    rule("chain/story-untested", "warn", { merge: "error" }),
    rule("chain/task-no-code", "error"),
    rule("chain/code-unlinked", "info"),
    rule("chain/done-honest", "error"),
    rule("chain/bug-regression", "warn", { merge: "error" }),
    rule("merge/superseded", "warn", { merge: "error" }),
    rule("merge/ordered-resource", "warn", { merge: "error" }),
    rule("sec/committed-secret", "error"),
    rule("evid/tests-passing", "warn", { gates: "error" }),
    rule("evid/stale", "warn"),
    rule("contract/valid", "error"),
    rule("contract/trusted", "error"),
    rule("profile/meta-valid", "error"),
    rule("pin/engine", "warn", { ui: "warn", ci: "error" }),
    rule("pin/profile", "warn", { ui: "warn", ci: "error" }),
    rule("guidance/stale", "warn"),
    rule("docs/todo-marker", "warn"),
    // Not present in FORMATS.md §6's table (the forge/GH area has no rows
    // there yet). Invented for GH-007 (branch-protection setup/verification)
    // by the forge work package (packages/engine/src/forge/rules.ts);
    // appended per this file's own "rule IDs frozen, new rules append"
    // convention. No FORMATS-stated severity, so "warn" per the documented
    // fallback above.
    rule("gh/branch-protection-missing", "warn"),
  ].map((r) => [r.id, r]),
);

/** Resolve a rule's severity given the context it's being evaluated under
 * (a gate name like `"merge"`/`"gates"`, or an evaluator context like
 * `"ci"`/`"ui"`). Falls back to the rule's `defaultSeverity` when no
 * override matches or no context is given. */
export function resolveSeverity(ruleId: string, context?: string): Finding["severity"] {
  const meta = RULE_REGISTRY[ruleId];
  if (!meta) {
    throw new Error(`unknown rule id "${ruleId}" — not in RULE_REGISTRY (FORMATS.md §6)`);
  }
  if (context && meta.overrides?.[context]) return meta.overrides[context];
  return meta.defaultSeverity;
}
