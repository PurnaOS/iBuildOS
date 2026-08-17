import { resolveSeverity, type Finding } from "@ibuildos/schemas";

// FORMATS.md §6/§7 (VG-012) — `pin/engine` and `pin/profile`: the recorded pin
// in ibuildos.yaml (`engine`, a semver range; `profile.version`, an exact
// version) must match the actual evaluator/profile version. Pure comparison —
// no I/O, no version-resolution against a registry.

type Semver = readonly [number, number, number];

function parseSemver(value: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function satisfiesComparator(actual: Semver, comparator: string): boolean {
  const match = /^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)/.exec(comparator.trim());
  if (!match) return false;
  const op = match[1] ?? "=";
  const bound = parseSemver(match[2]!);
  if (!bound) return false;
  const cmp = compareSemver(actual, bound);
  switch (op) {
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

/**
 * Does `actual` satisfy a `range` such as `">=1.0.0 <2.0.0"` (space-separated
 * comparators, AND'd together — the shape FORMATS.md §7's worked example
 * uses)? A pragmatic first pass, not a full semver-range implementation
 * (no `||` OR-groups, no `^`/`~` shorthand, no prerelease/build metadata).
 */
export function versionSatisfiesRange(actual: string, range: string): boolean {
  const actualParsed = parseSemver(actual);
  if (!actualParsed) return false;
  const comparators = range.trim().split(/\s+/).filter(Boolean);
  if (comparators.length === 0) return true;
  return comparators.every((comparator) => satisfiesComparator(actualParsed, comparator));
}

/**
 * `pin/engine`: the recorded `engine` pin (a semver range) must be satisfied
 * by the evaluator's actual version. `context` (`"ci"` / `"ui"` / a gate name)
 * is threaded to `resolveSeverity` per FORMATS §6's "error (CI) / warn (UI)".
 */
export function checkEnginePin(
  artifactId: string,
  recordedRange: string,
  actualVersion: string,
  context?: string,
): Finding[] {
  if (versionSatisfiesRange(actualVersion, recordedRange)) return [];

  return [
    {
      rule: "pin/engine",
      severity: resolveSeverity("pin/engine", context),
      artifact: artifactId,
      subject: "engine",
      message: `recorded engine pin "${recordedRange}" does not match evaluator version "${actualVersion}" (VG-012)`,
    },
  ];
}

/**
 * `pin/profile`: the recorded `profile.version` (an exact version, not a
 * range — see FORMATS §7's worked example) must equal the evaluator's actual
 * profile version.
 */
export function checkProfilePin(
  artifactId: string,
  recordedVersion: string,
  actualVersion: string,
  context?: string,
): Finding[] {
  if (recordedVersion.trim() === actualVersion.trim()) return [];

  return [
    {
      rule: "pin/profile",
      severity: resolveSeverity("pin/profile", context),
      artifact: artifactId,
      subject: "profile.version",
      message: `recorded profile pin "${recordedVersion}" does not match evaluator profile version "${actualVersion}" (VG-012)`,
    },
  ];
}
