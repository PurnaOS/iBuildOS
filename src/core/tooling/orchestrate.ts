// Orchestrates the project's EXISTING external tools — test runner, code
// linters, staleness checker (CQ-001/003/005, TT-009). iBuild reinvents none of
// them; it shells out to the configured commands and aggregates results. This is
// the only place the engine runs untrusted-ish commands, and it is never invoked
// by `validate` (the deterministic gate stays AI- and shell-free).

export interface CommandResult {
  label: string;
  exit: number;
  output: string;
}

export function runCommand(label: string, cmd: string, cwd: string): CommandResult {
  const p = Bun.spawnSync(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr);
  return { label, exit: p.exitCode ?? 1, output: out };
}

// testResultDoc renders a TestResult OKF artifact (TT-008). ranAt is optional so
// callers that want deterministic output can omit it.
export function testResultDoc(id: string, status: "passed" | "failed", runner: string, ranAt?: string): string {
  let s = `---\ntype: TestResult\nid: RESULT-${id}\nstatus: ${status}\n`;
  if (ranAt) s += `ran_at: ${ranAt}\n`;
  s += `runner: ${JSON.stringify(runner)}\n---\n\nCaptured by \`iBuild test\`. Runner exited ${status === "passed" ? "0" : "non-zero"}.\n`;
  return s;
}
