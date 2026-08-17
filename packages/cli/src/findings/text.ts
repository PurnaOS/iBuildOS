import type { FindingsReport } from "@ibuildos/schemas";

/** Human-readable rendering of a findings report, for `--format text`
 * (the default). One line per finding: `SEVERITY  ARTIFACT  RULE  SUBJECT
 * message`, then a summary line. Deterministic (the report's own `findings`
 * array is already sorted by `buildReport`). */
export function formatText(report: FindingsReport): string {
  const lines: string[] = [];

  for (const finding of report.findings) {
    const marker = finding.severity.toUpperCase().padEnd(5);
    lines.push(`${marker} ${finding.artifact}  ${finding.rule}  ${finding.subject}`);
    lines.push(`      ${finding.message}`);
    if (finding.fix) lines.push(`      fix: ${finding.fix}`);
  }

  if (report.findings.length > 0) lines.push("");

  const { errors, warnings, info, baselined } = report.summary;
  lines.push(
    `${errors} error(s), ${warnings} warning(s), ${info} info — ${baselined} baselined` +
      (report.gate ? ` (gate: ${report.gate})` : ""),
  );

  return lines.join("\n") + "\n";
}
