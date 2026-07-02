// Renders findings as human text or stable JSON. Port of Go internal/report.
import { type Finding, countBySeverity } from "../model/model.ts";

// text renders a human-readable report. Findings must already be finalized.
export function text(findings: Finding[]): string {
  const lines: string[] = [];
  for (const f of findings) {
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
    lines.push(`${loc}: ${f.severity} [${f.rule}] ${f.message}`);
  }
  if (findings.length === 0) {
    lines.push("OK: no problems found");
    return lines.join("\n") + "\n";
  }
  const { errors, warnings } = countBySeverity(findings);
  lines.push("");
  lines.push(`${plural(errors, "error")}, ${plural(warnings, "warning")}`);
  return lines.join("\n") + "\n";
}

// json writes the stable machine-readable report (the contract the Action parses).
// Object keys are constructed in a fixed order; `line` is omitted when 0 to match
// the Go report's omitempty.
export function json(findings: Finding[]): string {
  const { errors, warnings } = countBySeverity(findings);
  const rep = {
    version: "1",
    summary: { errors, warnings },
    findings: findings.map((f) => {
      const o: Record<string, unknown> = { severity: f.severity, file: f.file };
      if (f.line > 0) o.line = f.line;
      o.rule = f.rule;
      o.message = f.message;
      return o;
    }),
  };
  return JSON.stringify(rep, null, 2) + "\n";
}

function plural(n: number, word: string): string {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}
