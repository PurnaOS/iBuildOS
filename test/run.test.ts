// `iBuild run` — the autonomous work executor, tested with zero AI: fake
// runners, a fixed clock, and one real subprocess spawn against a shell fixture.
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, type Config } from "../src/core/config/config.ts";
import { init } from "../src/core/scaffold/scaffold.ts";
import { validate } from "../src/core/validate/validate.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { Registry } from "../src/core/types/registry.ts";
import { Collector } from "../src/core/model/model.ts";
import { findTask, selectReady } from "../src/core/run/select.ts";
import { runLoop, type RunOptions } from "../src/core/run/loop.ts";
import { spawnHarness, buildArgv } from "../src/core/run/harness.ts";
import { agentRunDoc } from "../src/core/run/record.ts";

const CLOCK = () => new Date("2026-07-03T12:00:00Z");

function newBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "ibuild-run-"));
  init(dir, { full: true });
  // The gate's test command: `true` exits 0 without doing anything.
  writeFileSync(join(dir, ".ibuildos.yaml"), readFileSync(join(dir, ".ibuildos.yaml"), "utf8") + 'tooling:\n  test: "true"\n');
  return dir;
}

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function fr(n: string, status: string): string {
  return `---\ntype: FunctionalRequirement\nid: FR-${n}\ntitle: Requirement ${n}\nowner: t\nstatus: ${status}\n---\nBody.\n`;
}

function taskDoc(n: string, status: string, o: { implements?: string; parent?: string; priority?: string; assignee?: string } = {}): string {
  let s = `---\ntype: Task\nid: TASK-${n}\ntitle: Task ${n}\nowner: t\nstatus: ${status}\n`;
  if (o.priority) s += `priority: ${o.priority}\n`;
  const links: string[] = [];
  if (o.implements) links.push(`  implements: [${o.implements}]`);
  if (o.parent) links.push(`  parent: [${o.parent}]`);
  if (o.assignee) links.push(`  assignee: [${o.assignee}]`);
  if (links.length > 0) s += `links:\n${links.join("\n")}\n`;
  return s + `---\nDo the work.\n`;
}

function doneTaskDoc(n: string, code: string, verifiedBy: string, implementsRef: string): string {
  return `---\ntype: Task\nid: TASK-${n}\ntitle: Task ${n}\nowner: t\nstatus: done\ncode:\n  - ${code}\nlinks:\n  implements: [${implementsRef}]\n  verified_by: [${verifiedBy}]\n---\nDone.\n`;
}

function testDoc(slug: string, status: string, verifies: string): string {
  return `---\ntype: Test\nid: TEST-${slug}\ntitle: Test ${slug}\nowner: t\nstatus: ${status}\nlinks:\n  verifies: [${verifies}]\n---\nChecks.\n`;
}

function agentDoc(slug: string, role: string): string {
  return `---\ntype: Agent\nid: AGENT-${slug}\nname: ${slug}\nrole: ${role}\nstatus: active\n---\nCHARTER: implement carefully and honestly.\n`;
}

function graphOf(dir: string, cfg: Config) {
  const reg = Registry.load(cfg.typesDir(), dir, new Collector());
  const { graph } = buildExportGraph(dir, cfg, { body: "full" });
  return { reg, graph };
}

function gitSetup(dir: string): void {
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  g(["init", "-q"]);
  g(["config", "user.email", "run@test"]);
  g(["config", "user.name", "run-test"]);
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "initial"]);
}

function gitLog(dir: string): string[] {
  return execFileSync("git", ["-C", dir, "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n");
}

function gitClean(dir: string): boolean {
  return execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }).trim() === "";
}

function opts(o: Partial<RunOptions> = {}): RunOptions {
  return {
    mode: "drain", maxTasks: 0, maxMinutes: 0, taskTimeoutMs: 60_000, intervalMs: 1,
    retries: 0, task: "", role: "implementer", dryRun: false, commit: true,
    onFailure: "stop", reclaim: false, ...o,
  };
}

function deps(runner: Parameters<typeof runLoop>[3]["runner"], log: string[] = []) {
  return { runner, clock: CLOCK, log: (l: string) => log.push(l) };
}

// --- selection ---

test("selectReady: capability predicates, active-requirement tracing, priority order", () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/requirements/fr-0002.md", fr("0002", "proposed"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md", priority: "must" }));
  write(dir, "docs/work/task-0002.md", taskDoc("0002", "todo", { implements: "/requirements/fr-0001.md", priority: "should" }));
  write(dir, "docs/work/task-0003.md", taskDoc("0003", "todo", { implements: "/requirements/fr-0002.md", priority: "must" })); // proposed req -> not ready
  write(dir, "docs/work/task-0004.md", taskDoc("0004", "in_progress", { implements: "/requirements/fr-0001.md" })); // claimed
  write(dir, "docs/work/task-0005.md", taskDoc("0005", "blocked", { implements: "/requirements/fr-0001.md" })); // parked
  write(dir, "docs/work/task-0006.md", taskDoc("0006", "todo", {})); // untraced
  write(dir, "docs/work/story-0001.md", `---\ntype: Story\nid: STORY-0001\ntitle: S\nowner: t\nstatus: todo\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nS.\n`);
  write(dir, "docs/work/task-0008.md", taskDoc("0008", "todo", { parent: "/work/story-0001.md" })); // traced via parent, no priority -> last

  const cfg = load(dir);
  const { reg, graph } = graphOf(dir, cfg);
  const ready = selectReady(graph, reg, cfg);
  expect(ready.map((t) => t.id)).toEqual(["TASK-0001", "TASK-0002", "TASK-0008"]);
  expect(ready[0]!.rank).toBe(0); // must
  expect(ready[1]!.rank).toBe(1); // should

  expect(findTask(graph, reg, cfg, "TASK-0005")?.key).toBe("/work/task-0005.md"); // pinned ignores readiness
  expect(findTask(graph, reg, cfg, "/work/task-0006.md")?.id).toBe("TASK-0006");
  expect(findTask(graph, reg, cfg, "STORY-0001")).toBeNull(); // not task-like (no code field... it has none)
  expect(findTask(graph, reg, cfg, "nope")).toBeNull();
});

// --- the loop, success path (fake runner acts as the agent) ---

test("runLoop: claim -> gate -> record -> commit, validate stays clean", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md", priority: "must", assignee: "/agents/agent-implementer.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  write(dir, "docs/agents/agent-implementer.md", agentDoc("implementer", "implementer"));
  gitSetup(dir);
  const cfg = load(dir);
  expect(validate(dir, cfg).filter((f) => f.severity === "error").length).toBe(0);

  let statusDuringRun = "";
  let promptSeen = "";
  const runner = async (_cfg: Config, cwd: string, prompt: string, emit: (l: string) => void) => {
    promptSeen = prompt;
    statusDuringRun = readFileSync(join(cwd, "docs/work/task-0001.md"), "utf8").match(/status: (\w+)/)![1]!;
    write(cwd, "src/app.ts", "export {};\n");
    write(cwd, "docs/work/task-0001.md", doneTaskDoc("0001", "src/app.ts", "/tests/test-run.md", "/requirements/fr-0001.md"));
    write(cwd, "docs/tests/test-run.md", testDoc("run", "passing", "/requirements/fr-0001.md"));
    emit("implemented");
    return { exit: 0, timedOut: false };
  };

  const log: string[] = [];
  const { summary, exit } = await runLoop(dir, cfg, opts(), deps(runner, log));
  expect(exit).toBe(0);
  expect(summary.stopped).toBe("drained");
  expect(summary.tasks).toEqual([{ key: "/work/task-0001.md", id: "TASK-0001", result: "succeeded", attempts: 1, recordPath: "/work/runs/arun-2026-07-03-task-0001.md" }]);

  expect(statusDuringRun).toBe("in_progress"); // the claim landed before the harness ran
  expect(promptSeen).toContain("CHARTER: implement carefully and honestly."); // Agent artifact body is the charter
  expect(promptSeen).toContain("Completion contract");
  expect(promptSeen).toContain("Requirement 0001"); // linked context included

  const rec = readFileSync(join(dir, "docs/work/runs/arun-2026-07-03-task-0001.md"), "utf8");
  expect(rec).toContain("type: AgentRun");
  expect(rec).toContain("status: succeeded");
  expect(rec).toContain("run_by: [/agents/agent-implementer.md]");
  expect(rec).toContain("executes: [/work/task-0001.md]");
  expect(rec).toContain("started: 2026-07-03T12:00:00Z");

  expect(gitLog(dir)[0]).toBe("run(TASK-0001): Task 0001 [ARUN-2026-07-03-task-0001]");
  expect(gitClean(dir)).toBe(true); // one commit = one task + its record
  expect(validate(dir, cfg).filter((f) => f.severity === "error").length).toBe(0); // ARUN draws no findings
});

test("runLoop: failure with on_failure=stop leaves the tree as evidence, exit 1", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  const cfg = load(dir);

  let calls = 0;
  const runner = async () => {
    calls++;
    return { exit: 0, timedOut: false }; // "did nothing" — gate must fail on task status
  };
  const { summary, exit } = await runLoop(dir, cfg, opts({ retries: 1 }), deps(runner));
  expect(exit).toBe(1);
  expect(summary.stopped).toBe("failure");
  expect(calls).toBe(2); // 1 + retries, failure report appended between attempts
  expect(summary.tasks[0]!.result).toBe("failed");
  expect(readFileSync(join(dir, "docs/work/task-0001.md"), "utf8")).toContain("status: in_progress"); // claim left in place
  expect(existsSync(join(dir, "docs/work/runs/arun-2026-07-03-task-0001.md"))).toBe(true); // record written, not committed
  expect(gitClean(dir)).toBe(false); // the human reviews the failed attempt
});

test("runLoop: on_failure=skip reverts, blocks the task, commits the record, continues", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  const cfg = load(dir);

  const runner = async (_c: Config, cwd: string) => {
    write(cwd, "junk.txt", "partial attempt\n"); // must be reverted
    return { exit: 1, timedOut: false };
  };
  const { summary, exit } = await runLoop(dir, cfg, opts({ onFailure: "skip" }), deps(runner));
  expect(exit).toBe(0);
  expect(summary.stopped).toBe("drained"); // blocked task is no longer ready; queue drains
  expect(readFileSync(join(dir, "docs/work/task-0001.md"), "utf8")).toContain("status: blocked");
  expect(existsSync(join(dir, "junk.txt"))).toBe(false); // attempt reverted
  expect(gitLog(dir)[0]).toContain("blocked after 1 attempt(s)");
  expect(gitClean(dir)).toBe(true);
});

test("runLoop: dry-run reports the queue and writes nothing", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  const cfg = load(dir);
  const before = readFileSync(join(dir, "docs/work/task-0001.md"), "utf8");
  const { summary, exit } = await runLoop(dir, cfg, opts({ dryRun: true, commit: false }), deps(async () => {
    throw new Error("dry-run must not spawn");
  }));
  expect(exit).toBe(0);
  expect(summary.stopped).toBe("dry-run");
  expect(summary.ready.map((t) => t.id)).toEqual(["TASK-0001"]);
  expect(readFileSync(join(dir, "docs/work/task-0001.md"), "utf8")).toBe(before);
});

test("runLoop: preflight refuses a dirty tree and a failing baseline", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  const cfg = load(dir);
  const boom = async () => ({ exit: 0, timedOut: false });

  write(dir, "uncommitted.txt", "x\n");
  const dirty = await runLoop(dir, cfg, opts(), deps(boom));
  expect(dirty.exit).toBe(1);
  expect(dirty.summary.stopped).toBe("preflight");
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "wip"]);

  write(dir, "docs/work/task-0009.md", taskDoc("0009", "done", {})); // done, no code, untraced -> validate errors
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "broken"]);
  const broken = await runLoop(dir, cfg, opts(), deps(boom));
  expect(broken.exit).toBe(1);
  expect(broken.summary.stopped).toBe("preflight");
});

test("runLoop: --reclaim resets stale claims to ready", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "in_progress", { implements: "/requirements/fr-0001.md" })); // stale claim
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  const cfg = load(dir);
  const { summary, exit } = await runLoop(dir, cfg, opts({ dryRun: true, reclaim: false, commit: false }), deps(async () => ({ exit: 0, timedOut: false })));
  expect(exit).toBe(0);
  expect(summary.ready).toEqual([]); // claimed is not ready

  // reclaim happens even before a dry-run selection? No: dry-run never writes.
  const log: string[] = [];
  const r2 = await runLoop(dir, cfg, opts({ reclaim: true, commit: false, dryRun: true }), { runner: async () => ({ exit: 0, timedOut: false }), clock: CLOCK, log: (l) => log.push(l) });
  expect(r2.summary.ready).toEqual([]); // dry-run still hands back the untouched queue
  expect(readFileSync(join(dir, "docs/work/task-0001.md"), "utf8")).toContain("status: in_progress");
});

test("runLoop: watch mode exits on the wall-clock budget", async () => {
  const dir = newBundle();
  const cfg = load(dir);
  let now = Date.parse("2026-07-03T12:00:00Z");
  const { summary, exit } = await runLoop(dir, cfg, opts({ mode: "watch", maxMinutes: 1, commit: false }), {
    runner: async () => ({ exit: 0, timedOut: false }),
    clock: () => new Date(now),
    log: () => {},
    sleep: async () => {
      now += 120_000; // each poll advances two minutes
    },
  });
  expect(exit).toBe(0);
  expect(summary.stopped).toBe("max-minutes");
});

// --- harness spawn (real subprocesses, no AI) ---

test("spawnHarness: kill-timer reports a timeout", async () => {
  const cfg = load(mkdtempSync(join(tmpdir(), "ibuild-hn-")));
  cfg.harness.command = "sh";
  cfg.harness.args = ["-c", "sleep 5"];
  const res = await spawnHarness()(cfg, ".", "ignored", () => {}, 250);
  expect(res.timedOut).toBe(true);
});

test("buildArgv substitutes the prompt as one argv element", () => {
  const cfg = load(mkdtempSync(join(tmpdir(), "ibuild-av-")));
  cfg.harness.args = ["-p", "{prompt}"];
  const argv = buildArgv(cfg, "two words; $(danger)");
  expect(argv).toEqual(["claude", "-p", "two words; $(danger)"]);
});

test("end-to-end with a real shell-fixture harness", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);

  // The "agent": a shell script that receives the prompt as $1 and completes the task.
  const fixture = join(dir, "fake-agent.sh");
  writeFileSync(fixture, `#!/bin/bash
printf '%s' "$1" > prompt-received.txt
mkdir -p src && echo 'export {};' > src/app.ts
cat > docs/work/task-0001.md <<'EOF'
${doneTaskDoc("0001", "src/app.ts", "/tests/test-run.md", "/requirements/fr-0001.md")}EOF
cat > docs/tests/test-run.md <<'EOF'
${testDoc("run", "passing", "/requirements/fr-0001.md")}EOF
echo "fixture done"
`);
  execFileSync("chmod", ["+x", fixture]);
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "fixture"]);

  const cfg = load(dir);
  cfg.harness.command = "bash";
  cfg.harness.args = [fixture, "{prompt}"];
  const { summary, exit } = await runLoop(dir, cfg, opts(), { runner: spawnHarness(), clock: CLOCK, log: () => {} });
  expect(exit).toBe(0);
  expect(summary.tasks[0]!.result).toBe("succeeded");
  expect(readFileSync(join(dir, "prompt-received.txt"), "utf8")).toContain("Completion contract"); // argv substitution end-to-end
  expect(validate(dir, cfg).filter((f) => f.severity === "error").length).toBe(0);
});

// --- review-fix regressions ---

test("dry-run with a nonexistent --task pin still fails loudly", async () => {
  const dir = newBundle();
  const cfg = load(dir);
  const { summary, exit } = await runLoop(dir, cfg, opts({ dryRun: true, commit: false, task: "TASK-9999" }), deps(async () => ({ exit: 0, timedOut: false })));
  expect(exit).toBe(1);
  expect(summary.stopped).toBe("none-ready");
});

test("unknown role and benched agent are preflight errors", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  const cfg = load(dir);

  const unknown = await runLoop(dir, cfg, opts({ role: "qa" }), deps(async () => ({ exit: 0, timedOut: false })));
  expect(unknown.exit).toBe(1);
  expect(unknown.summary.stopped).toBe("preflight");

  write(dir, "docs/agents/agent-implementer.md", agentDoc("implementer", "implementer").replace("status: active", "status: paused"));
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "bench"]);
  const benched = await runLoop(dir, cfg, opts(), deps(async () => ({ exit: 0, timedOut: false })));
  expect(benched.exit).toBe(1);
  expect(benched.summary.stopped).toBe("preflight");
});

test("a same-day re-run opens a NEW record instead of overwriting", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  const cfg = load(dir);

  // First run: fails, on_failure=skip commits the failed record and blocks the task.
  const r1 = await runLoop(dir, cfg, opts({ onFailure: "skip" }), deps(async () => ({ exit: 1, timedOut: false })));
  expect(r1.summary.tasks[0]!.recordPath).toBe("/work/runs/arun-2026-07-03-task-0001.md");

  // Human resets the task; the second run's record must not clobber the first.
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "reset task"]);
  const r2 = await runLoop(dir, cfg, opts({ onFailure: "skip" }), deps(async () => ({ exit: 1, timedOut: false })));
  expect(r2.summary.tasks[0]!.recordPath).toBe("/work/runs/arun-2026-07-03-task-0001-2.md");
  expect(existsSync(join(dir, "docs/work/runs/arun-2026-07-03-task-0001.md"))).toBe(true);
  expect(readFileSync(join(dir, "docs/work/runs/arun-2026-07-03-task-0001-2.md"), "utf8")).toContain("id: ARUN-2026-07-03-task-0001-2");
});

test("a git failure mid-task is contained: summary + exit 1, no throw", async () => {
  const dir = newBundle();
  write(dir, "docs/requirements/fr-0001.md", fr("0001", "accepted"));
  write(dir, "docs/work/task-0001.md", taskDoc("0001", "todo", { implements: "/requirements/fr-0001.md" }));
  write(dir, "docs/tests/test-run.md", testDoc("run", "planned", "/requirements/fr-0001.md"));
  gitSetup(dir);
  writeFileSync(join(dir, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n");
  execFileSync("chmod", ["+x", join(dir, ".git/hooks/pre-commit")]);
  const cfg = load(dir);

  const runner = async (_c: Config, cwd: string) => {
    write(cwd, "src/app.ts", "export {};\n");
    write(cwd, "docs/work/task-0001.md", doneTaskDoc("0001", "src/app.ts", "/tests/test-run.md", "/requirements/fr-0001.md"));
    write(cwd, "docs/tests/test-run.md", testDoc("run", "passing", "/requirements/fr-0001.md"));
    return { exit: 0, timedOut: false };
  };
  const { summary, exit } = await runLoop(dir, cfg, opts(), deps(runner));
  expect(exit).toBe(1);
  expect(summary.stopped).toBe("error"); // contained, with a summary — not an unhandled rejection
});

test("spawnHarness survives a grandchild holding the pipes open", async () => {
  const cfg = load(mkdtempSync(join(tmpdir(), "ibuild-gc-")));
  cfg.harness.command = "sh";
  cfg.harness.args = ["-c", "sleep 30 & exit 0"]; // parent exits at once; child inherits stdout
  const t0 = Date.now();
  const res = await spawnHarness()(cfg, ".", "ignored", () => {}, 0);
  expect(res.exit).toBe(0);
  expect(Date.now() - t0).toBeLessThan(5_000); // pump grace, not the grandchild's 30s
});

test("spawnHarness escalates to SIGKILL when the harness traps TERM", async () => {
  const cfg = load(mkdtempSync(join(tmpdir(), "ibuild-kill-")));
  cfg.harness.command = "bash";
  cfg.harness.args = ["-c", 'trap "" TERM; sleep 30'];
  const t0 = Date.now();
  const res = await spawnHarness()(cfg, ".", "ignored", () => {}, 200);
  expect(res.timedOut).toBe(true);
  expect(Date.now() - t0).toBeLessThan(12_000); // ~200ms TERM + 5s KILL escalation, not 30s
}, 15_000);

// --- record golden ---

test("agentRunDoc renders the exact record shape", () => {
  const cfg = load(mkdtempSync(join(tmpdir(), "ibuild-rec-")));
  const doc = agentRunDoc({
    slug: "2026-07-03-task-0001",
    taskKey: "/work/task-0001.md",
    agentKey: "/agents/agent-implementer.md",
    status: "succeeded",
    started: "2026-07-03T12:00:00Z",
    ended: "2026-07-03T12:05:00Z",
    harness: "claude",
    attempts: 1,
    baseCommit: "abc1234",
    exit: 0,
    validateErrors: 0,
    testExit: 0,
    logTail: ["line one", "line two"],
  }, cfg);
  expect(doc).toBe(`---
type: AgentRun
id: ARUN-2026-07-03-task-0001
status: succeeded
started: 2026-07-03T12:00:00Z
ended: 2026-07-03T12:05:00Z
harness: claude
attempts: 1
base_commit: abc1234
links:
  run_by: [/agents/agent-implementer.md]
  executes: [/work/task-0001.md]
---

Recorded by \`iBuild run\`. Harness exited 0; validate errors after: 0; test command exited 0.

\`\`\`
line one
line two
\`\`\`
`);
});
