// Baseline & ratchet (VL-013): a committed record of accepted pre-existing
// violations so the gate blocks only NEW ones on a brownfield repo. Built on the
// same finding currency as everything else; a finding's fingerprint is
// (rule, file, message) — line is excluded so unrelated edits above a violation
// don't break the match. The baseline may only shrink (ratchet): you regenerate
// and commit a smaller one as you pay down debt.
import { readFileSync } from "node:fs";
import type { Finding } from "../model/model.ts";

export interface BaselineEntry {
  rule: string;
  file: string;
  message: string;
}

export interface Baseline {
  version: string;
  entries: BaselineEntry[];
}

export function fingerprint(f: { rule: string; file: string; message: string }): string {
  return `${f.rule}\0${f.file}\0${f.message}`;
}

// makeBaseline records the current findings as accepted debt (sorted + deduped).
export function makeBaseline(findings: Finding[]): Baseline {
  const seen = new Set<string>();
  const entries: BaselineEntry[] = [];
  for (const f of findings) {
    const k = fingerprint(f);
    if (seen.has(k)) continue;
    seen.add(k);
    entries.push({ rule: f.rule, file: f.file, message: f.message });
  }
  entries.sort((a, b) => (fingerprint(a) < fingerprint(b) ? -1 : 1));
  return { version: "1", entries };
}

export function loadBaseline(path: string): Baseline | null {
  try {
    const b = JSON.parse(readFileSync(path, "utf8")) as Baseline;
    return { version: b.version ?? "1", entries: Array.isArray(b.entries) ? b.entries : [] };
  } catch {
    return null;
  }
}

// applyBaseline partitions findings into fresh (gate-relevant) vs. baselined
// (accepted pre-existing debt, reported informationally).
export function applyBaseline(findings: Finding[], bl: Baseline): { fresh: Finding[]; baselined: Finding[] } {
  const accepted = new Set(bl.entries.map(fingerprint));
  const fresh: Finding[] = [];
  const baselined: Finding[] = [];
  for (const f of findings) (accepted.has(fingerprint(f)) ? baselined : fresh).push(f);
  return { fresh, baselined };
}
