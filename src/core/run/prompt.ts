// Prompt assembly for one task run. Pure string building; every chain name is
// read from config at runtime (zero taxonomy literals), so an alternate profile
// re-phrases the completion contract with no code change. The charter comes from
// a repo artifact (cfg.run.roles) — the prompt that drives an agent is itself
// versioned and reviewable (AG-008).
import type { Config } from "../config/config.ts";
import type { Graph, GraphNode } from "../graphx/graph.ts";

export const DEFAULT_CHARTER = `You are an implementer agent. Read the task and its linked requirement(s)
below, then implement the work end-to-end: write the real code and real tests,
run the project's lint/typecheck/build/test commands, and fix every failure.
Work only on this task.`;

export interface PromptInput {
  task: GraphNode; // the claimed task (body via excerpt, full)
  context: Graph; // focus() neighborhood around the task
  charter: string; // role charter body (Agent artifact or DEFAULT_CHARTER)
  contract: string; // agentsMD(cfg, version)
  testTargets: string[]; // reg.relTargets(chain.verifiedByRel) — runtime data
  cfg: Config;
}

function nodeBlock(n: GraphNode, full: boolean): string {
  let s = `- ${n.key} (type: ${n.type}${n.status ? `, status: ${n.status}` : ""})`;
  const title = n.fields?.title;
  if (typeof title === "string" && title !== "") s += ` — ${title}`;
  if (full && n.excerpt) s += `\n\n${n.excerpt}\n`;
  return s;
}

export function buildTaskPrompt(inp: PromptInput): string {
  const ch = inp.cfg.chain;
  const testCmd = inp.cfg.tooling.test;
  const lines: string[] = [];

  lines.push("# Role", "", inp.charter.trim(), "");
  lines.push("# Your task", "", nodeBlock(inp.task, true));

  const others = inp.context.nodes.filter((n) => n.key !== inp.task.key);
  if (others.length > 0) {
    lines.push("# Linked context (the typed graph around your task)", "");
    for (const n of others) lines.push(nodeBlock(n, true));
    lines.push("");
    for (const e of inp.context.edges) lines.push(`- ${e.from} —${e.relationship}→ ${e.to}${e.resolved ? "" : " (unresolved)"}`);
    lines.push("");
  }

  lines.push("# Completion contract", "");
  lines.push(`When — and only when — the work is genuinely complete:`);
  lines.push(`1. Set the task's \`status:\` to \`${ch.doneStatuses[0] ?? "done"}\`.`);
  lines.push(`2. Add \`${ch.codeField}:\` globs to the task frontmatter matching the source files you created or changed.`);
  lines.push(
    `3. Link \`${ch.verifiedByRel}:\` to an artifact of type ${inp.testTargets.map((t) => `\`${t}\``).join(" / ") || "(a test type)"} ` +
      `and set that artifact's status to \`${ch.passingStatuses[0] ?? "passing"}\` only once${testCmd ? ` \`${testCmd}\`` : " the test suite"} actually passes.`,
  );
  lines.push(`4. Run \`iBuild validate . --format json\` and fix every error that mentions your task.`);
  lines.push(`5. Do NOT \`git add\`, commit, or push — the runner records and commits. Do not start any other task.`);
  lines.push("");
  lines.push("# Project contract (AGENTS.md)", "", inp.contract.trim(), "");
  return lines.join("\n");
}

// failureReport is appended to the prompt on a retry so the agent sees exactly
// what the deterministic gate rejected.
export function failureReport(attempt: number, reasons: string[]): string {
  return [
    "",
    `# Previous attempt ${attempt} FAILED the deterministic gate`,
    "",
    "Fix these before anything else:",
    ...reasons.map((r) => `- ${r}`),
    "",
  ].join("\n");
}
