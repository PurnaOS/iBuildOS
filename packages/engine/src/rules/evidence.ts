import { resolveSeverity, type Finding } from "@ibuildos/schemas";

// FORMATS.md §6 — `evid/tests-passing` and `evid/stale`. Neither rule owns a
// TestResult store (that's later work); both accept a caller-supplied lookup /
// policy so this module stays pure and dependency-injected.

export type TestVerdict = "pass" | "fail" | "pending" | (string & {});

export interface TestResultLike {
  verdict: TestVerdict;
  /** ISO-8601 timestamp the result was recorded at. */
  at: string;
}

/** Look up the TestResult bound (`verified_by`) to an artifact, if any. */
export type TestResultLookup = (artifactId: string) => TestResultLike | undefined;

/**
 * `evid/tests-passing`: a bound TestResult must exist and be `verdict: "pass"`
 * at the evaluated commit. `context` (a gate name like `"gates"`, or evaluator
 * context) is threaded straight to `resolveSeverity` so direct callers/tests
 * can exercise the `gates: "error"` override without going through the gate
 * composition engine.
 */
export function checkTestsPassing(
  artifactId: string,
  lookup: TestResultLookup,
  context?: string,
): Finding[] {
  const result = lookup(artifactId);
  if (result?.verdict === "pass") return [];

  return [
    {
      rule: "evid/tests-passing",
      severity: resolveSeverity("evid/tests-passing", context),
      artifact: artifactId,
      subject: "verified_by",
      message: result
        ? `bound test result verdict is "${result.verdict}", not "pass"`
        : `no bound test result found for "${artifactId}"`,
    },
  ];
}

/** How old a bound TestResult is allowed to be relative to the evaluated commit. */
export interface StalenessPolicy {
  maxAgeMs: number;
}

/**
 * `evid/stale`: evidence older than the policy allows relative to the commit
 * being evaluated. Both timestamps and the policy are caller-supplied — this
 * module hardcodes no "how old is too old" number.
 */
export function checkEvidenceStale(
  artifactId: string,
  testResultAt: string | Date,
  evaluatedAt: string | Date,
  policy: StalenessPolicy,
): Finding[] {
  const resultTime = toEpochMs(testResultAt);
  const evalTime = toEpochMs(evaluatedAt);
  const ageMs = evalTime - resultTime;

  if (ageMs <= policy.maxAgeMs) return [];

  return [
    {
      rule: "evid/stale",
      severity: resolveSeverity("evid/stale"),
      artifact: artifactId,
      subject: "verified_by",
      message: `bound test evidence is ${ageMs}ms old, exceeding the policy's max age of ${policy.maxAgeMs}ms`,
    },
  ];
}

function toEpochMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
