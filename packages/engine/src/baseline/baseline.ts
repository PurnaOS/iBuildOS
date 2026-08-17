import { BaselineSchema, type Baseline, type BaselineEntry, type Finding } from "@ibuildos/schemas";
import { fingerprint } from "./fingerprint.js";

export function loadBaseline(raw: string): Baseline {
  return BaselineSchema.parse(JSON.parse(raw));
}

function entryKey(entry: Pick<BaselineEntry, "rule" | "artifact" | "fp">): string {
  return `${entry.rule}\0${entry.artifact}\0${entry.fp}`;
}

function compareStrings(a: string, b: string): number {
  // Never localeCompare here: the byte-identity CI guard (CLAUDE.md) runs
  // ubuntu x macos, and locale-aware ordering isn't guaranteed stable across them.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Serialized key order follows FORMATS.md §8's worked example verbatim; spreading the
// parsed object would instead follow Zod's (unspecified) key insertion order.
export function serializeBaseline(baseline: Baseline): string {
  const entries = [...baseline.entries].sort((a, b) => compareStrings(entryKey(a), entryKey(b)));
  const ordered = {
    formats: baseline.formats,
    engine: baseline.engine,
    profile: baseline.profile,
    generated: baseline.generated,
    scope_events: baseline.scope_events,
    entries,
  };
  return JSON.stringify(ordered, null, 2);
}

// Findings straight from the rule engine carry no `fp` yet (it's computed once, per FORMATS
// §12's "present once computed"); findings round-tripped from a committed findings report or
// baseline already carry the fp that report committed to, and that value must be honored
// rather than silently recomputed out from under it.
export function isBaselined(baseline: Baseline, finding: Finding): boolean {
  const fp = finding.fp ?? fingerprint(finding);
  return baseline.entries.some(
    (entry) => entry.rule === finding.rule && entry.artifact === finding.artifact && entry.fp === fp,
  );
}

// Stamps `fp` on every finding that lacks one (FORMATS §12: findings JSON carries `fp` on
// each entry) so a blocking finding can be copied straight into baseline.json without the
// caller re-deriving the fingerprint formula itself.
export function applyBaseline(
  baseline: Baseline,
  findings: Finding[],
): { blocking: Finding[]; baselined: Finding[] } {
  const blocking: Finding[] = [];
  const baselined: Finding[] = [];
  for (const finding of findings) {
    const stamped = finding.fp === undefined ? { ...finding, fp: fingerprint(finding) } : finding;
    (isBaselined(baseline, stamped) ? baselined : blocking).push(stamped);
  }
  return { blocking, baselined };
}

type ScopeEvent = Baseline["scope_events"][number];

function scopeEventKey(event: ScopeEvent): string {
  return `${event.at}\0${event.added_paths.join("\0")}\0${event.entries}`;
}

// scope_events is an append-only audit log (FORMATS §8): "added between previous and next"
// means previous's events are an unmodified prefix of next's, with at least one more appended.
// A composite-key Set would wrongly treat two identical re-run events as "nothing new".
function hasNewScopeEvent(previous: Baseline, next: Baseline): boolean {
  if (next.scope_events.length <= previous.scope_events.length) return false;
  return previous.scope_events.every((event, i) => {
    const candidate = next.scope_events[i];
    return candidate !== undefined && scopeEventKey(event) === scopeEventKey(candidate);
  });
}

export interface ShrinkOnlyViolation {
  rule: string;
  artifact: string;
  fp: string;
}

export interface ShrinkOnlyResult {
  ok: boolean;
  violations: ShrinkOnlyViolation[];
}

// Ratchet (BF-005/G-19): next.entries may only shrink relative to previous.entries, unless a
// new scope_events record was appended between previous and next — in which case any growth is
// scope-justified. Returns a result rather than throwing so callers (CLI, gate) choose how to
// report it; it is not itself the enforcement point.
export function checkShrinkOnly(previous: Baseline, next: Baseline): ShrinkOnlyResult {
  const previousKeys = new Set(previous.entries.map(entryKey));
  const scopeJustified = hasNewScopeEvent(previous, next);

  const violations: ShrinkOnlyViolation[] = [];
  for (const entry of next.entries) {
    if (previousKeys.has(entryKey(entry))) continue;
    if (scopeJustified) continue;
    violations.push({ rule: entry.rule, artifact: entry.artifact, fp: entry.fp });
  }

  return { ok: violations.length === 0, violations };
}
