import {
  FindingsReportSchema,
  type Baseline,
  type Finding,
  type FindingsReport,
  type ProfileManifest,
} from "@ibuildos/schemas";
import { applyBaseline, fingerprint } from "@ibuildos/engine";

/** FORMATS §12's worked example: `"profile": "ibuildos-default@1.0.0"`. */
export function formatProfileField(manifest: ProfileManifest | undefined): string {
  return manifest ? `${manifest.name}@${manifest.version}` : "unknown";
}

// Never localeCompare here — same reasoning as baseline.ts's compareStrings:
// the ubuntu x macos byte-identity CI guard needs ordering stable across
// locales, and localeCompare's collation isn't guaranteed to be.
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      compareStrings(a.artifact, b.artifact) ||
      compareStrings(a.rule, b.rule) ||
      compareStrings(a.subject, b.subject),
  );
}

export interface BuildReportOptions {
  engineVersion: string;
  /** Pre-formatted `name@version` (see `formatProfileField`), or `"unknown"`
   * when no profile manifest was loaded. */
  profile: string;
  commit: string;
  /** The gate name evaluated (`gate <name>`), or `""` for a plain `validate`
   * with no named gate. */
  gate: string;
  findings: Finding[];
  /** When given, findings matching a baseline entry are moved out of the
   * `findings` list and counted in `summary.baselined` instead (FORMATS §12:
   * `"baselined": 14` alongside a shorter `findings` array). */
  baseline?: Baseline;
}

/** Assemble a `FindingsReport` (FORMATS §12's stable JSON shape): stamp `fp`
 * on every finding that lacks one, apply the baseline if given, sort for
 * determinism, and validate the result against `FindingsReportSchema` before
 * returning it — a malformed report is a bug in this function, not something
 * a caller should have to catch. */
export function buildReport(options: BuildReportOptions): FindingsReport {
  const stamped = options.findings.map((f) =>
    f.fp === undefined ? { ...f, fp: fingerprint(f) } : f,
  );

  let findings = stamped;
  let baselined = 0;
  if (options.baseline) {
    const applied = applyBaseline(options.baseline, stamped);
    findings = applied.blocking;
    baselined = applied.baselined.length;
  }

  const sorted = sortFindings(findings);

  const report: FindingsReport = {
    formats: 1,
    engine: options.engineVersion,
    profile: options.profile,
    commit: options.commit,
    gate: options.gate,
    findings: sorted,
    summary: {
      errors: sorted.filter((f) => f.severity === "error").length,
      warnings: sorted.filter((f) => f.severity === "warn").length,
      info: sorted.filter((f) => f.severity === "info").length,
      baselined,
    },
  };

  return FindingsReportSchema.parse(report);
}

/** FORMATS §12 exit codes 0/1: does this report contain a blocking error? */
export function hasBlockingError(report: FindingsReport): boolean {
  return report.summary.errors > 0;
}
