import { BaselineSchema, type Baseline, type BaselineEntry, type Finding } from "@ibuildos/schemas";
import { fingerprint } from "../baseline/fingerprint.js";

// SPEC.md BF-006 (baseline on day one): "Initial validation debt shall be baselined (VG-008)
// so the gate is useful immediately; burndown is visible (IN-006)." This is close to a direct
// call into `../baseline/index.ts` — a day-one baseline is not a new kind of baseline, just a
// `Baseline` whose `entries` are every finding a first full validation pass produced. This
// module supplies exactly the missing step: turning a findings batch into that `Baseline`
// value. It reuses `fingerprint` from `../baseline/fingerprint.ts` (never recomputes the
// formula) and produces output that `loadBaseline`/`serializeBaseline`/`isBaselined`/
// `applyBaseline`/`checkShrinkOnly` all consume unmodified — nothing here duplicates their
// logic.

export interface GenerateInitialBaselineOptions {
  /** Engine version that produced this baseline (VG-008/VG-012: "Baseline fingerprints
   * record the engine version that produced them"). */
  engine: string;
  /** Profile name@version this baseline was generated against (FORMATS §8). */
  profile: string;
  /** ISO-8601 datetime with offset; defaults to `new Date().toISOString()`. */
  generated?: string;
  /**
   * When adoption starts already scoped to specific paths/areas (BF-005), day one is itself
   * a scope-expansion event — the very first one — so burndown reporting (IN-006) can tell
   * "new scope" apart from "regression" from the start (VG-008's amended text). Omit for an
   * adoption that baselines the whole repo unscoped.
   */
  initialScope?: {
    /** Glob patterns describing the paths/areas adopted on day one. */
    addedPaths: readonly string[];
    /** `YYYY-MM-DD`; defaults to `generated`'s date portion. */
    at?: string;
  };
}

/**
 * Generate a day-one `Baseline` from a first full validation pass's findings (BF-006). Every
 * distinct (rule, artifact, fp) triple across `findings` becomes one baseline entry — findings
 * without a precomputed `fp` (fresh off the rule engine, per FORMATS §12 "present once
 * computed") are fingerprinted here; findings already carrying one (round-tripped from a
 * findings report) keep it, per the same honor-don't-recompute rule `isBaselined` follows.
 * Entries are deduplicated (repeat rule/artifact/subject collapses to one entry, matching
 * FORMATS §8: "two findings on the same rule+artifact+subject are one baseline entry") but
 * otherwise left in encounter order — `serializeBaseline` is responsible for the canonical
 * sort order on write, not this function.
 *
 * Returns a value already validated against `BaselineSchema`, ready for `serializeBaseline`.
 */
export function generateInitialBaseline(
  findings: readonly Finding[],
  options: GenerateInitialBaselineOptions,
): Baseline {
  const generated = options.generated ?? new Date().toISOString();

  const seen = new Set<string>();
  const entries: BaselineEntry[] = [];
  for (const finding of findings) {
    const fp = finding.fp ?? fingerprint(finding);
    const key = `${finding.rule}\0${finding.artifact}\0${fp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ rule: finding.rule, artifact: finding.artifact, fp });
  }

  const scope_events = options.initialScope
    ? [
        {
          at: options.initialScope.at ?? generated.slice(0, 10),
          added_paths: [...options.initialScope.addedPaths],
          entries: entries.length,
        },
      ]
    : [];

  return BaselineSchema.parse({
    formats: 1,
    engine: options.engine,
    profile: options.profile,
    generated,
    scope_events,
    entries,
  });
}
