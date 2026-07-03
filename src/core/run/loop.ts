// The `iBuild run` orchestrator (AG-012): claim → prompt → spawn → gate →
// record → commit → next. Deterministic control flow around an AI subprocess —
// the linter never runs inside AI, and AI never runs inside the linter; this
// module sits beside studio/tooling on the orchestration side of that line.
// All state is repo state: the claim is a status flip in the task artifact, the
// audit is an AgentRun record (AG-011), the ledger is one local commit per task.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Config } from "../config/config.ts";
import { validate } from "../validate/validate.ts";
import { buildExportGraph } from "../validate/export.ts";
import { focus } from "../graphx/graph.ts";
import { Registry } from "../types/registry.ts";
import { Collector } from "../model/model.ts";
import { agentsMD } from "../contract/contract.ts";
import { runCommand } from "../tooling/orchestrate.ts";
import { FrontmatterEditor } from "../okf/editor.ts";
import { parse as parseOkf } from "../okf/frontmatter.ts";
import { text as reportText } from "../report/report.ts";
import { type ReadyTask, findTask, selectReady } from "./select.ts";
import { DEFAULT_CHARTER, buildTaskPrompt, failureReport } from "./prompt.ts";
import { type RunRecord, agentRunDoc, recordRootRel, utcStamp } from "./record.ts";
import type { TaskRunner } from "./harness.ts";
import { commitAll, head, isClean, isRepo, revertAll } from "./git.ts";

export interface RunOptions {
  mode: "drain" | "once" | "watch";
  maxTasks: number;
  maxMinutes: number;
  taskTimeoutMs: number;
  intervalMs: number;
  retries: number;
  task: string; // --task pin, "" for queue order
  role: string;
  dryRun: boolean;
  commit: boolean;
  onFailure: "stop" | "skip";
  reclaim: boolean;
}

export interface TaskOutcome {
  key: string;
  id: string;
  result: "succeeded" | "failed" | "aborted";
  attempts: number;
  recordPath: string; // /root-relative record key
}

export interface RunSummary {
  version: string;
  generator: string;
  stopped: string; // drained | none-ready | max-tasks | max-minutes | failure | dry-run | preflight
  ready: ReadyTask[]; // the queue at the last selection (dry-run reports it)
  tasks: TaskOutcome[];
}

// RunDeps are injected so tests run the whole loop with a fake harness, a fixed
// clock, and a captured log — zero AI, byte-stable assertions.
export interface RunDeps {
  runner: TaskRunner;
  clock: () => Date;
  log: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

interface Gate {
  ok: boolean;
  validateErrors: number;
  testExit: number | null;
  reasons: string[];
}

function summary(stopped: string, ready: ReadyTask[], tasks: TaskOutcome[]): RunSummary {
  return { version: "1", generator: "iBuild run", stopped, ready, tasks };
}

function errorCount(bundleDir: string, cfg: Config): number {
  return validate(bundleDir, cfg).filter((f) => f.severity === "error").length;
}

// taskStatus re-reads one artifact's status from disk (the agent edits the file;
// the gate trusts only what is actually written).
function taskStatus(cfg: Config, key: string): string {
  try {
    const abs = cfg.resolveLink(key);
    const [d, err] = parseOkf(abs, readFileSync(abs, "utf8"));
    if (err || !d.hasFrontmatter) return "";
    const st = (d.toJS() as Record<string, unknown>).status;
    return typeof st === "string" ? st : "";
  } catch {
    return "";
  }
}

function setTaskStatus(cfg: Config, key: string, status: string): void {
  const abs = cfg.resolveLink(key);
  const ed = new FrontmatterEditor(readFileSync(abs, "utf8"));
  ed.setScalar("status", status);
  writeFileSync(abs, ed.text());
}

// charterFor loads the role charter body from the configured agent artifact.
// An unconfigured role is a usage error (the roles map is config); a configured
// agent whose status is not spawn-able (benched/retired — vocabulary from
// run.agent_active_statuses) refuses to run. A missing/empty charter file falls
// back to the built-in default so a bare bundle still runs — loudly.
function charterFor(cfg: Config, role: string, log: (l: string) => void): { charter: string; agentKey: string; error: string } {
  if (!(role in cfg.run.roles)) {
    return { charter: "", agentKey: "", error: `role ${JSON.stringify(role)} is not configured under run.roles` };
  }
  const key = cfg.run.roles[role]!;
  try {
    const abs = cfg.resolveLink(key);
    const [d, err] = parseOkf(abs, readFileSync(abs, "utf8"));
    if (!err && d.hasFrontmatter) {
      const st = (d.toJS() as Record<string, unknown>).status;
      if (typeof st === "string" && st !== "" && !cfg.run.agentActiveStatuses.includes(st)) {
        return { charter: "", agentKey: "", error: `agent ${key} is ${JSON.stringify(st)} — not spawn-able (run.agent_active_statuses)` };
      }
      if (d.body.trim() !== "") return { charter: d.body.trim(), agentKey: key, error: "" };
    }
  } catch {
    /* fall through to default */
  }
  log(`run: no charter at ${key} — using the built-in default (no ${cfg.run.runByRel} attribution)`);
  return { charter: DEFAULT_CHARTER, agentKey: "", error: "" };
}

function gateTask(bundleDir: string, cfg: Config, task: ReadyTask): Gate {
  const reasons: string[] = [];
  const findings = validate(bundleDir, cfg);
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    reasons.push(`iBuild validate reports ${errors.length} error(s):`);
    reasons.push(...reportText(errors).trim().split("\n").slice(0, 20));
  }
  const st = taskStatus(cfg, task.key);
  if (!cfg.chain.doneStatuses.includes(st)) {
    reasons.push(`the task's status is ${JSON.stringify(st)} — it must be ${JSON.stringify(cfg.chain.doneStatuses[0] ?? "done")} with the completion contract satisfied`);
  }
  let testExit: number | null = null;
  if (cfg.run.gateTest && cfg.tooling.test !== "") {
    const res = runCommand("test", cfg.tooling.test, bundleDir);
    testExit = res.exit;
    if (res.exit !== 0) {
      reasons.push(`the project test command (${cfg.tooling.test}) exited ${res.exit}:`);
      reasons.push(...res.output.trim().split("\n").slice(-20));
    }
  }
  return { ok: reasons.length === 0, validateErrors: errors.length, testExit, reasons };
}

// writeRecord uniquifies the slug so a re-run of the same task on the same day
// opens a NEW record instead of overwriting the earlier audit entry.
function writeRecord(cfg: Config, rec: RunRecord): { key: string; slug: string } {
  let slug = rec.slug;
  for (let n = 2; existsSync(cfg.resolveLink(recordRootRel(cfg, slug))); n++) {
    slug = `${rec.slug}-${n}`;
  }
  const key = recordRootRel(cfg, slug);
  const abs = cfg.resolveLink(key);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, agentRunDoc({ ...rec, slug }, cfg));
  return { key, slug };
}

function slugFor(task: ReadyTask, clock: () => Date): string {
  const date = utcStamp(clock()).slice(0, 10);
  const base = (task.id !== "" ? task.id : task.key.replace(/\.md$/, "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${date}-${base}`;
}

// runLoop drives the whole run; returns the summary plus the process exit code.
export async function runLoop(bundleDir: string, cfg: Config, opts: RunOptions, deps: RunDeps): Promise<{ summary: RunSummary; exit: number }> {
  const startedAt = deps.clock().getTime();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const outcomes: TaskOutcome[] = [];

  // Preflight: refuse to claim anything on a broken foundation.
  if (opts.commit && !opts.dryRun) {
    if (!isRepo(bundleDir)) {
      deps.log("run: not a git repository — use --no-commit or init git first");
      return { summary: summary("preflight", [], []), exit: 1 };
    }
    if (!isClean(bundleDir)) {
      deps.log("run: working tree is not clean — commit or stash first (the clean-tree start is what makes failure recovery safe)");
      return { summary: summary("preflight", [], []), exit: 1 };
    }
  }
  if (!opts.dryRun) {
    const baseErrors = errorCount(bundleDir, cfg);
    if (baseErrors > 0) {
      deps.log(`run: baseline validate reports ${baseErrors} error(s) — the gate must start clean (fix or baseline them first)`);
      return { summary: summary("preflight", [], []), exit: 1 };
    }
  }

  for (;;) {
    // Fresh graph every iteration: the previous task's edits are repo state.
    const reg = Registry.load(cfg.typesDir(), bundleDir, new Collector());
    const { graph } = buildExportGraph(bundleDir, cfg, { body: "full" });

    // Stale claims: tasks sitting at the claim status from a dead run.
    const stale = graph.nodes.filter((n) => {
      const res = reg.resolve(n.type);
      return res && !res.abstract && res.fields.has(cfg.chain.codeField) && n.status === cfg.chain.claimStatus;
    });
    if (stale.length > 0 && opts.reclaim && !opts.dryRun) {
      for (const n of stale) {
        setTaskStatus(cfg, n.key, cfg.chain.readyStatuses[0] ?? "todo");
        deps.log(`run: reclaimed ${n.key} (${cfg.chain.claimStatus} -> ${cfg.chain.readyStatuses[0] ?? "todo"})`);
      }
      continue; // re-select with the repaired state
    }
    for (const n of stale) deps.log(`run: note — ${n.key} is ${cfg.chain.claimStatus} (stale claim? use --reclaim)`);

    const queue = opts.task !== "" ? [findTask(graph, reg, cfg, opts.task)].filter((t): t is ReadyTask => t !== null) : selectReady(graph, reg, cfg);

    if (opts.task !== "" && queue.length === 0) {
      deps.log(`run: --task ${opts.task} not found or not task-like`);
      return { summary: summary("none-ready", queue, outcomes), exit: 1 };
    }
    if (opts.dryRun) {
      return { summary: summary("dry-run", queue, outcomes), exit: 0 };
    }
    if (queue.length === 0) {
      if (opts.mode === "watch") {
        const minutes = (deps.clock().getTime() - startedAt) / 60000;
        if (opts.maxMinutes > 0 && minutes >= opts.maxMinutes) return { summary: summary("max-minutes", queue, outcomes), exit: 0 };
        await sleep(opts.intervalMs);
        continue;
      }
      return { summary: summary(outcomes.length > 0 ? "drained" : "none-ready", queue, outcomes), exit: 0 };
    }
    if (opts.maxTasks > 0 && outcomes.length >= opts.maxTasks) {
      return { summary: summary("max-tasks", queue, outcomes), exit: 0 };
    }
    if (opts.maxMinutes > 0 && (deps.clock().getTime() - startedAt) / 60000 >= opts.maxMinutes) {
      return { summary: summary("max-minutes", queue, outcomes), exit: 0 };
    }

    const task = queue[0]!;
    const { charter, agentKey, error: charterErr } = charterFor(cfg, opts.role, deps.log);
    if (charterErr !== "") {
      deps.log(`run: ${charterErr}`);
      return { summary: summary("preflight", queue, outcomes), exit: 1 };
    }
    // Re-check the clean-tree precondition before EVERY claim, not just at
    // preflight: a human may have edited during the previous harness run or a
    // --watch sleep, and both the ledger commit (`add -A`) and the failure
    // revert would otherwise sweep or destroy that work.
    if (opts.commit && !isClean(bundleDir)) {
      deps.log("run: working tree changed since the last task (human edits?) — stopping before the next claim; commit or stash, then re-run");
      return { summary: summary("dirty-tree", queue, outcomes), exit: 1 };
    }
    const baseCommit = opts.commit ? head(bundleDir) : "";
    const started = utcStamp(deps.clock());
    const slug = slugFor(task, deps.clock);

    deps.log(`run: claiming ${task.id !== "" ? task.id : task.key} — ${task.title}`);
    setTaskStatus(cfg, task.key, cfg.chain.claimStatus);

    const context = focus(graph, task.key, 2, [cfg.chain.implementsRel, cfg.chain.parentRel, cfg.chain.verifiedByRel]);
    const taskNode = graph.nodes.find((n) => n.key === task.key)!;
    let prompt = buildTaskPrompt({
      task: taskNode,
      context,
      charter,
      contract: agentsMD(cfg, "run"),
      testTargets: reg.relTargets(cfg.chain.verifiedByRel),
      cfg,
    });

    const logTail: string[] = [];
    const emit = (line: string) => {
      deps.log(`  [${task.id !== "" ? task.id : task.key}] ${line}`);
      logTail.push(line);
      if (logTail.length > 40) logTail.shift();
    };

    let gate: Gate = { ok: false, validateErrors: 0, testExit: null, reasons: [] };
    let exit = -1;
    let timedOut = false;
    let attempts = 0;
    let result: TaskOutcome["result"] = "failed";
    // Contain harness/git failures: an exception here must still produce a
    // summary and a sane exit — never an unhandled rejection with the task
    // left silently claimed.
    try {
      for (let attempt = 1; attempt <= 1 + Math.max(opts.retries, 0); attempt++) {
        attempts = attempt;
        const res = await deps.runner(cfg, bundleDir, prompt, emit, opts.taskTimeoutMs);
        exit = res.exit;
        timedOut = res.timedOut;
        if (timedOut) {
          deps.log(`run: ${task.key} timed out after ${Math.round(opts.taskTimeoutMs / 60000)}m`);
          break; // a wedged harness is not retried blind — record and apply the failure policy
        }
        gate = gateTask(bundleDir, cfg, task);
        if (gate.ok) break;
        deps.log(`run: attempt ${attempt} failed the gate (${gate.reasons[0] ?? "unknown"})`);
        prompt += failureReport(attempt, gate.reasons);
      }

      result = timedOut ? "aborted" : gate.ok ? "succeeded" : "failed";
      const rec: RunRecord = {
        slug,
        taskKey: task.key,
        agentKey,
        status: result,
        started,
        ended: utcStamp(deps.clock()),
        harness: cfg.harness.name,
        attempts,
        baseCommit,
        exit,
        validateErrors: gate.validateErrors,
        testExit: gate.testExit,
        logTail,
      };

      if (result === "succeeded") {
        const { key: recordPath, slug: recSlug } = writeRecord(cfg, rec);
        outcomes.push({ key: task.key, id: task.id, result, attempts, recordPath });
        if (opts.commit) {
          commitAll(bundleDir, `run(${task.id !== "" ? task.id : task.key}): ${task.title} [ARUN-${recSlug}]`);
          deps.log(`run: committed ${task.key} (${recordPath})`);
        } else {
          deps.log(`run: ${task.key} done — left uncommitted for review (--no-commit); stopping (a dirty tree blocks the next claim)`);
          return { summary: summary("drained", [], outcomes), exit: 0 };
        }
      } else if (opts.onFailure === "skip" && opts.commit) {
        // Revert the attempt (safe: tree was clean at claim), park the task, record, continue.
        revertAll(bundleDir);
        setTaskStatus(cfg, task.key, cfg.chain.blockedStatus);
        const { key: recordPath, slug: recSlug } = writeRecord(cfg, rec);
        outcomes.push({ key: task.key, id: task.id, result, attempts, recordPath });
        commitAll(bundleDir, `run(${task.id !== "" ? task.id : task.key}): blocked after ${attempts} attempt(s) [ARUN-${recSlug}]`);
        deps.log(`run: ${task.key} blocked (${recordPath}) — continuing`);
      } else {
        // stop: leave the tree exactly as the agent left it — failed work is evidence.
        const { key: recordPath } = writeRecord(cfg, rec);
        outcomes.push({ key: task.key, id: task.id, result, attempts, recordPath });
        deps.log(`run: ${task.key} ${result} after ${attempts} attempt(s) — working tree left for review (${recordPath})`);
        return { summary: summary("failure", [], outcomes), exit: 1 };
      }
    } catch (e) {
      deps.log(`run: error on ${task.key} — ${(e as Error).message}`);
      deps.log("run: stopping; the working tree and the claim are left as-is for review");
      return { summary: summary("error", [], outcomes), exit: 1 };
    }

    if (opts.mode === "once") {
      return { summary: summary("once", [], outcomes), exit: result === "succeeded" ? 0 : 1 };
    }
    if (opts.task !== "") {
      return { summary: summary("drained", [], outcomes), exit: result === "succeeded" ? 0 : 1 };
    }
  }
}
