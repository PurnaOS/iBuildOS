import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  TerminalExitStatus,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
} from "@agentclientprotocol/sdk";
import { resolveScoped } from "./scope.js";
import type { WorktreePathResolver } from "./types.js";

// AC-007 — `terminal/*`, scoped to the session's worktree. Commands run as
// real child processes (no shell string — argv array, matching the
// project's `execFile`-not-`exec` convention elsewhere in the repo);
// `cwd` (when given) is scope-checked exactly like an fs path.

const DEFAULT_OUTPUT_BYTE_LIMIT = 1_000_000;

interface TerminalState {
  child: ChildProcess;
  output: string;
  truncated: boolean;
  byteLimit: number;
  exitStatus: TerminalExitStatus | null;
  exitWaiters: Array<(status: TerminalExitStatus) => void>;
}

export interface TerminalService {
  create(params: CreateTerminalRequest): CreateTerminalResponse;
  output(params: TerminalOutputRequest): TerminalOutputResponse;
  waitForExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse>;
  kill(params: KillTerminalRequest): KillTerminalResponse;
  release(params: ReleaseTerminalRequest): ReleaseTerminalResponse;
  /** Test/shutdown helper: kills every terminal this service ever created
   * that's still running. Not part of the ACP client surface. */
  killAll(): void;
}

export function createTerminalService(resolveWorktree: WorktreePathResolver): TerminalService {
  const terminals = new Map<string, TerminalState>();

  function append(state: TerminalState, chunk: Buffer): void {
    state.output += chunk.toString("utf8");
    const limit = state.byteLimit;
    if (Buffer.byteLength(state.output, "utf8") > limit) {
      state.truncated = true;
      while (Buffer.byteLength(state.output, "utf8") > limit && state.output.length > 0) {
        state.output = state.output.slice(1);
      }
    }
  }

  function requireTerminal(terminalId: string): TerminalState {
    const state = terminals.get(terminalId);
    if (!state) throw new Error(`unknown terminal id: ${terminalId}`);
    return state;
  }

  return {
    create(params: CreateTerminalRequest): CreateTerminalResponse {
      const root = resolveWorktree();
      const cwd = params.cwd ? resolveScoped(root, params.cwd) : root;
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const e of params.env ?? []) env[e.name] = e.value;

      const child = spawn(params.command, params.args ?? [], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const state: TerminalState = {
        child,
        output: "",
        truncated: false,
        byteLimit: params.outputByteLimit ?? DEFAULT_OUTPUT_BYTE_LIMIT,
        exitStatus: null,
        exitWaiters: [],
      };
      child.stdout?.on("data", (chunk: Buffer) => append(state, chunk));
      child.stderr?.on("data", (chunk: Buffer) => append(state, chunk));
      child.on("exit", (code, signal) => {
        const status: TerminalExitStatus = { exitCode: code, signal: signal ?? null };
        state.exitStatus = status;
        for (const waiter of state.exitWaiters.splice(0)) waiter(status);
      });

      const terminalId = randomUUID();
      terminals.set(terminalId, state);
      return { terminalId };
    },

    output(params: TerminalOutputRequest): TerminalOutputResponse {
      const state = requireTerminal(params.terminalId);
      return { output: state.output, truncated: state.truncated, exitStatus: state.exitStatus };
    },

    async waitForExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
      const state = requireTerminal(params.terminalId);
      const status =
        state.exitStatus ??
        (await new Promise<TerminalExitStatus>((resolve) => state.exitWaiters.push(resolve)));
      return { exitCode: status.exitCode ?? null, signal: status.signal ?? null };
    },

    kill(params: KillTerminalRequest): KillTerminalResponse {
      requireTerminal(params.terminalId).child.kill();
      return {};
    },

    release(params: ReleaseTerminalRequest): ReleaseTerminalResponse {
      const state = terminals.get(params.terminalId);
      if (state && state.exitStatus === null) state.child.kill();
      terminals.delete(params.terminalId);
      return {};
    },

    killAll(): void {
      for (const state of terminals.values()) {
        if (state.exitStatus === null) state.child.kill();
      }
    },
  };
}
