// The dependency-free types shared across all layers: the Finding currency and a
// Collector that accumulates them. Port of Go internal/model.

export type Severity = "error" | "warning";

// Finding is the single currency of the tool. Everything reduces to a sorted,
// deduped list of these. `line` is 0 when there is no line (omitted in output).
export interface Finding {
  severity: Severity;
  file: string;
  line: number;
  rule: string;
  message: string;
}

// toSlash normalizes path separators so findings are byte-identical across OSes.
export function toSlash(p: string): string {
  return p.replaceAll("\\", "/");
}

// Collector accumulates findings during a run.
export class Collector {
  readonly items: Finding[] = [];

  private add(severity: Severity, file: string, line: number, rule: string, message: string): void {
    this.items.push({ severity, file: toSlash(file), line, rule, message });
  }

  errf(file: string, line: number, rule: string, message: string): void {
    this.add("error", file, line, rule, message);
  }

  warnf(file: string, line: number, rule: string, message: string): void {
    this.add("warning", file, line, rule, message);
  }
}

// dedupeKey is the canonical comparable key for a Finding (Go used the struct
// itself as a map key; we join with NUL to avoid delimiter collisions).
function dedupeKey(f: Finding): string {
  return `${f.severity}\0${f.file}\0${f.line}\0${f.rule}\0${f.message}`;
}

// finalize dedupes (by full value) and stably sorts findings by file, line,
// rule, then message — guaranteeing byte-identical output for a given bundle.
// ponytail: string `<` is UTF-16 code-unit order — deterministic across OSes,
// which is all the gate needs; upgrade to byte compare only if a profile uses
// astral-plane chars in paths/rules.
export function finalize(items: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of items) {
    const k = dedupeKey(f);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(f);
    }
  }
  out.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
  return out;
}

// countBySeverity returns the number of error and warning findings.
export function countBySeverity(items: Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of items) {
    if (f.severity === "error") errors++;
    else if (f.severity === "warning") warnings++;
  }
  return { errors, warnings };
}
