// Renders the run-record OKF artifact (AG-011) — the audit-log unit, written the
// way tooling/orchestrate.ts writes a TestResult: the type name appears only
// inside the document template (data the profile defines, not an engine
// decision). Timestamps come from the caller's clock so tests stay byte-stable.
import type { Config } from "../config/config.ts";

export interface RunRecord {
  slug: string; // e.g. 2026-07-03-task-0005 (ARUN-<slug> id)
  taskKey: string; // /work/task-0005.md (executes link)
  agentKey: string; // /agents/agent-implementer.md (run_by link), "" to omit
  status: "succeeded" | "failed" | "aborted";
  started: string; // UTC, YYYY-MM-DDTHH:MM:SSZ (required by the profile)
  ended: string; // "" to omit
  harness: string;
  attempts: number;
  baseCommit: string; // "" to omit
  exit: number;
  validateErrors: number;
  testExit: number | null;
  logTail: string[]; // last harness lines, fenced in the body
}

// utcStamp formats a Date as the profile's regex shape (second precision, Z).
export function utcStamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function agentRunDoc(r: RunRecord, cfg: Config): string {
  let s = `---\ntype: AgentRun\nid: ARUN-${r.slug}\nstatus: ${r.status}\nstarted: ${r.started}\n`;
  if (r.ended !== "") s += `ended: ${r.ended}\n`;
  if (r.harness !== "") s += `harness: ${r.harness}\n`;
  s += `attempts: ${r.attempts}\n`;
  if (r.baseCommit !== "") s += `base_commit: ${r.baseCommit}\n`;
  s += `links:\n`;
  if (r.agentKey !== "") s += `  ${cfg.run.runByRel}: [${r.agentKey}]\n`;
  s += `  ${cfg.run.executesRel}: [${r.taskKey}]\n`;
  s += `---\n\n`;
  s += `Recorded by \`iBuild run\`. Harness exited ${r.exit}; validate errors after: ${r.validateErrors}`;
  s += r.testExit === null ? `; test gate skipped.\n` : `; test command exited ${r.testExit}.\n`;
  if (r.logTail.length > 0) {
    s += `\n\`\`\`\n${r.logTail.join("\n")}\n\`\`\`\n`;
  }
  return s;
}

// recordRootRel is the /root-relative key the record is written to.
export function recordRootRel(cfg: Config, slug: string): string {
  return `/${cfg.run.recordsDir.replace(/^\/|\/$/g, "")}/arun-${slug}.md`;
}
