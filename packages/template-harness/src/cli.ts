#!/usr/bin/env node
import { runTemplateGuarantee } from "./guarantee.js";
import type { TemplateGuaranteeOptions, TemplateGuaranteeReport } from "./types.js";

// Thin CLI over runTemplateGuarantee, so a future CI job (template CI per
// TECH-STACK.md T-012's closing note) can shell out to this package and get
// either a human-readable report or `--json` for machine annotation. Exits 1
// when the guarantee fails, 0 when it holds — a normal CI gate.

export function usage(): never {
  console.error(
    "usage: ibuildos-template-harness <template-dir> [--component=<name>] [--port=<n>] [--json]",
  );
  process.exit(2);
}

export function parseArgs(argv: string[]): { templateDir: string; options: TemplateGuaranteeOptions; json: boolean } {
  const [templateDir, ...rest] = argv;
  if (!templateDir) usage();

  const options: TemplateGuaranteeOptions = {};
  let json = false;

  for (const arg of rest) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) usage();
    // Both groups are required (`[^=]+`/`.*`) so are always strings when match succeeds.
    const key = match[1]!;
    const value = match[2]!;
    if (key === "component") options.component = value;
    else if (key === "port") options.port = Number(value);
    else usage();
  }

  return { templateDir, options, json };
}

export function formatReport(report: TemplateGuaranteeReport): string {
  const lines: string[] = [];
  const header = `Template guarantee for ${report.templateDir}${report.component ? ` (component "${report.component}")` : ""}: ${report.ok ? "PASS" : "FAIL"}`;
  lines.push(header);

  for (const step of report.steps) {
    const marker = step.status === "pass" ? "[PASS]" : step.status === "fail" ? "[FAIL]" : "[SKIP]";
    lines.push(`  ${marker} ${step.name} (${Math.round(step.durationMs)}ms) - ${step.detail}`);
    if (step.status === "fail" && step.stderr) {
      const tail = step.stderr.split("\n").slice(-10).join("\n         ");
      lines.push(`         stderr: ${tail}`);
    }
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const { templateDir, options, json } = parseArgs(process.argv.slice(2));
  const report = await runTemplateGuarantee(templateDir, options);

  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

// Only run when executed directly (`node cli.ts`, or the `ibuildos-template-harness` bin) — not
// when imported, e.g. by cli.test.ts, which exercises parseArgs/formatReport/usage in isolation
// without spawning the whole guarantee pipeline or calling process.exit.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
