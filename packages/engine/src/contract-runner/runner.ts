import net from "node:net";
import http from "node:http";
import { execa } from "execa";
import { checkContractTrusted } from "../rules/contract.js";
import type { SecretStore } from "../secrets/secret-store.js";

// TP-004/TP-008/T-011 — the execution layer over a project's contract
// commands (dev/test/lint/seed/migrate/build). This module owns three
// things the deterministic rule engine deliberately does not:
//
//  1. Actually spawning contract commands (argv arrays only, never a shell
//     string — TP-004's "single interface through which iBuildOS runs the
//     project's own tooling").
//  2. TOFU trust gating (TP-008) in front of every spawn, reusing
//     `checkContractTrusted`/`computeContractHash` from `rules/contract.ts`
//     rather than re-deriving the hash here.
//  3. Long-running dev-process lifecycle: tree-kill on stop, port-liveness
//     readiness, and health-checked restart on unexpected death
//     ("restart-not-signal is the recovery primitive" — T-011 — because
//     Windows process termination is abrupt and has no resumable signal
//     story).
//
// This module performs real process I/O and a loopback TCP/HTTP liveness
// probe. CLAUDE.md's "deterministic first" rule targets the *validation/gate
// engine* (no AI, no network, byte-identical output) — it is not a ban on
// this package ever touching a socket. T-011 explicitly places the contract
// runner (execa + port-liveness + health-checked restart) inside
// `packages/engine`, so a loopback readiness probe here is in-scope; it never
// feeds into a Finding or a gate verdict.
//
// Secrets: env values named in a contract's `environments[*].secrets` are
// resolved through the injected `SecretStore` — never read from
// `process.env` directly. Non-secret `vars` come straight from the caller's
// config. The base process env is reduced to a small allowlist (PATH and OS
// plumbing only) rather than inherited wholesale — least-privilege per
// TP-008's "secrets are injected only where per-variable policy allows, not
// by default."

// ---------------------------------------------------------------------------
// Trust gate (TP-008)
// ---------------------------------------------------------------------------

/** What TOFU trust-checking needs for one run: the `contract` section of
 * `ibuildos.yaml` (exactly what `computeContractHash` hashes), the caller's
 * last-confirmed hash for this project (`undefined` = never trusted), and a
 * stable label used only in error/finding messages. */
export interface TrustContext {
  contract: unknown;
  trustedHash: string | undefined;
  artifactId: string;
}

/** Thrown when a contract-hash mismatch was detected and the injected
 * `confirmTrust()` callback resolved `false` (or the caller declined by
 * throwing). No command is spawned in this case. */
export class ContractTrustDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractTrustDeniedError";
  }
}

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

/** Structurally compatible with `EnvironmentSchema`'s parsed shape
 * (`packages/schemas/src/config.ts`) without importing it by name, so this
 * module stays decoupled from the exact zod shape. */
export interface EnvironmentConfig {
  vars?: Record<string, string>;
  secrets?: string[];
}

// ---------------------------------------------------------------------------
// One-shot command execution (test/lint/seed/migrate/build)
// ---------------------------------------------------------------------------

export interface RunCommandRequest {
  trust: TrustContext;
  /** `[file, ...args]` — an argv array from `ContractComponentSchema.commands`.
   * Never a shell string (TP-004). */
  argv: string[];
  cwd: string;
  environment?: EnvironmentConfig;
  /** If set, the whole process tree is killed once this elapses. */
  timeoutMs?: number;
}

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Port liveness
// ---------------------------------------------------------------------------

/** Injected, not assumed — this module hardcodes no preview URL shape.
 * `path` present ⇒ HTTP GET check (mirrors `PreviewSchema.ready`); absent ⇒
 * a bare TCP connect. */
export interface PortLivenessConfig {
  host?: string;
  port: number;
  path?: string;
  expectedStatus?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_LIVENESS_HOST = "127.0.0.1";
const DEFAULT_LIVENESS_INTERVAL_MS = 250;
const DEFAULT_LIVENESS_TIMEOUT_MS = 30_000;
const DEFAULT_EXPECTED_STATUS = 200;
const PROBE_TIMEOUT_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkTcp(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (err: Error | undefined) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(new Error("tcp connect timeout")));
    socket.once("error", (err) => finish(err));
    socket.once("connect", () => finish(undefined));
  });
}

function checkHttp(host: string, port: number, path: string, expectedStatus: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path, timeout: PROBE_TIMEOUT_MS }, (res) => {
      res.resume(); // drain so the socket can close
      if (res.statusCode === expectedStatus) {
        resolve();
      } else {
        reject(new Error(`expected HTTP ${expectedStatus} from ${host}:${port}${path}, got ${res.statusCode}`));
      }
    });
    req.once("error", reject);
    req.once("timeout", () => {
      req.destroy();
      reject(new Error("http request timeout"));
    });
  });
}

/** Poll a TCP connect (or HTTP GET, when `path` is set) until it succeeds or
 * `timeoutMs` elapses. Used to know when a `dev`-command process has actually
 * started serving, not just that the process spawned. */
export async function waitForPortLiveness(config: PortLivenessConfig): Promise<void> {
  const host = config.host ?? DEFAULT_LIVENESS_HOST;
  const intervalMs = config.intervalMs ?? DEFAULT_LIVENESS_INTERVAL_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS;
  const expectedStatus = config.expectedStatus ?? DEFAULT_EXPECTED_STATUS;
  const deadline = Date.now() + timeoutMs;

  let lastError: unknown;
  for (;;) {
    try {
      if (config.path !== undefined) {
        await checkHttp(host, config.port, config.path, expectedStatus);
      } else {
        await checkTcp(host, config.port);
      }
      return;
    } catch (err) {
      lastError = err;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `port-liveness check for ${host}:${config.port}${config.path ?? ""} timed out after ${timeoutMs}ms (last error: ${String(lastError)})`,
      );
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}

// ---------------------------------------------------------------------------
// Tree-kill (T-011)
// ---------------------------------------------------------------------------
//
// execa 9.6.1 has no `killDescendants`-style option — verified empirically
// against the installed package's typings (`options.d.ts`/`subprocess.d.ts`):
// only `detached`, `cleanup`, `killSignal`, and `forceKillAfterDelay` exist,
// and `subprocess.kill()` signals only the direct child (confirmed with a
// throwaway parent→child→grandchild PoC: a plain `.kill()` left the
// grandchild running). T-011's prose names `killDescendants` as if it were an
// execa option; it is not, in this version. The actual mechanism:
//
//  - POSIX: spawn with `detached: true` so the child becomes its own
//    process-group leader (pgid == its own pid), then signal the *group* via
//    `process.kill(-pid, signal)` (negative pid). Every descendant spawned
//    without its own `detached: true` inherits that group and dies with it.
//    Verified empirically: parent+child+grandchild all gone after
//    `process.kill(-pid, 'SIGTERM')`, vs. the negative control where a plain
//    `subprocess.kill()` left the grandchild alive and heartbeating.
//  - Windows has no POSIX process groups; `taskkill /pid <pid> /T /F` walks
//    the tree itself and force-terminates it. This is inherently abrupt (no
//    graceful signal delivered down the tree) — precisely why T-011 makes
//    restart-not-signal the recovery primitive for long-running processes.
//    This branch is implemented but unexercised on this (darwin) runner.

async function isAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function signalTree(pid: number, signal: NodeJS.Signals): Promise<void> {
  if (process.platform === "win32") {
    await execa("taskkill", ["/pid", String(pid), "/T", "/F"], { reject: false });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

/** Kill a whole process tree: SIGTERM the group, give it `graceMs` to exit,
 * then SIGKILL what's left. On Windows, `taskkill /F` is already a forceful
 * whole-tree kill with no grace period to wait out. */
async function killProcessTree(pid: number, graceMs = 2_000): Promise<void> {
  if (process.platform === "win32") {
    await signalTree(pid, "SIGKILL");
    return;
  }
  await signalTree(pid, "SIGTERM");
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!(await isAlive(pid))) return;
    await sleep(50);
  }
  if (await isAlive(pid)) {
    await signalTree(pid, "SIGKILL");
  }
}

// ---------------------------------------------------------------------------
// Long-running managed process (dev servers)
// ---------------------------------------------------------------------------

export interface RestartPolicy {
  /** Total unexpected exits tolerated for this managed process's entire
   * lifetime before giving up permanently — a lifetime cap, not a
   * crash-loop-window count (a process that dies 3 times over hours, each
   * time recovering fine in between, still exhausts this the same as a
   * tight crash loop). @default 3 */
  maxRestarts?: number;
  /** Delay before each restart attempt. @default 500 */
  backoffMs?: number;
}

export interface StartDevProcessRequest {
  trust: TrustContext;
  argv: string[];
  cwd: string;
  environment?: EnvironmentConfig;
  /** When set, `waitUntilReady()` polls this instead of resolving as soon as
   * the process spawns. */
  portLiveness?: PortLivenessConfig;
  restart?: RestartPolicy;
}

export interface ProcessExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** `false` for a deliberate `stop()`; `true` for anything else. */
  unexpected: boolean;
  /** `true` when this unexpected exit triggered a restart attempt. */
  restarted: boolean;
}

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ManagedDevProcess {
  readonly pid: number | undefined;
  readonly restartCount: number;
  readonly stopped: boolean;
  /** Resolves once the port-liveness check (if configured) succeeds, or
   * immediately once the process has spawned when none is configured.
   * Rejects if the process exits, or liveness times out, before then. */
  waitUntilReady(): Promise<void>;
  /** Deliberate stop: tree-kills the current attempt and disarms restart. */
  stop(): Promise<void>;
  onExit(listener: (info: ProcessExitInfo) => void): () => void;
  onOutput(listener: (chunk: OutputChunk) => void): () => void;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_BACKOFF_MS = 500;

class DevProcessManager implements ManagedDevProcess {
  private _pid: number | undefined;
  private _restartCount = 0;
  private _stopped = false;
  private stopping = false;
  /** True once the *current* spawn attempt's `exit` event has fired — guards
   * `stop()` against signaling a pid that has already exited (e.g. mid
   * crash-loop backoff), which could otherwise hit a since-recycled pid. */
  private currentExited = false;
  private readyDeferred = createDeferred<void>();
  private readySettled = false;
  private readonly exitListeners = new Set<(info: ProcessExitInfo) => void>();
  private readonly outputListeners = new Set<(chunk: OutputChunk) => void>();
  private readonly maxRestarts: number;
  private readonly backoffMs: number;

  constructor(
    private readonly argv: string[],
    private readonly cwd: string,
    private readonly env: Record<string, string>,
    private readonly portLiveness: PortLivenessConfig | undefined,
    restart: RestartPolicy | undefined,
  ) {
    this.maxRestarts = restart?.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    this.backoffMs = restart?.backoffMs ?? DEFAULT_RESTART_BACKOFF_MS;
    this.spawnAttempt();
  }

  get pid(): number | undefined {
    return this._pid;
  }

  get restartCount(): number {
    return this._restartCount;
  }

  get stopped(): boolean {
    return this._stopped;
  }

  waitUntilReady(): Promise<void> {
    return this.readyDeferred.promise;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this._stopped = true;
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyDeferred.reject(new Error("process stopped before becoming ready"));
    }
    if (this._pid !== undefined && !this.currentExited) {
      await killProcessTree(this._pid);
    }
  }

  onExit(listener: (info: ProcessExitInfo) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  onOutput(listener: (chunk: OutputChunk) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  private spawnAttempt(): void {
    this.currentExited = false;
    const subprocess = execa(this.argv[0] as string, this.argv.slice(1), {
      cwd: this.cwd,
      env: this.env,
      extendEnv: false,
      reject: false,
      detached: process.platform !== "win32",
      cleanup: true,
    });
    this._pid = subprocess.pid;

    subprocess.stdout?.on("data", (chunk: Buffer) => this.emitOutput("stdout", chunk));
    subprocess.stderr?.on("data", (chunk: Buffer) => this.emitOutput("stderr", chunk));
    subprocess.on("exit", (code, signal) => this.handleExit(code, signal));
    // `reject: false` already means this resolves rather than rejects, but
    // guard against any other rejection path so we never get an unhandled
    // rejection warning from a killed subprocess.
    subprocess.catch(() => {});

    if (this.portLiveness === undefined) {
      this.settleReady(undefined);
    } else {
      waitForPortLiveness(this.portLiveness).then(
        () => this.settleReady(undefined),
        (err: unknown) => this.settleReady(err),
      );
    }
  }

  private settleReady(err: unknown): void {
    if (this.readySettled || this.stopping) return;
    this.readySettled = true;
    if (err === undefined) {
      this.readyDeferred.resolve();
    } else {
      this.readyDeferred.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.currentExited = true;
    if (this.stopping) {
      this.emitExit({ code, signal, unexpected: false, restarted: false });
      return;
    }
    if (!this.readySettled) {
      this.settleReady(new Error(`process exited (code=${code}, signal=${signal}) before becoming ready`));
    }
    if (this._restartCount < this.maxRestarts) {
      this._restartCount += 1;
      this.emitExit({ code, signal, unexpected: true, restarted: true });
      setTimeout(() => {
        if (!this.stopping) this.spawnAttempt();
      }, this.backoffMs);
    } else {
      this._stopped = true;
      this.emitExit({ code, signal, unexpected: true, restarted: false });
    }
  }

  private emitExit(info: ProcessExitInfo): void {
    for (const listener of this.exitListeners) listener(info);
  }

  private emitOutput(stream: "stdout" | "stderr", chunk: Buffer): void {
    const text = chunk.toString("utf8");
    for (const listener of this.outputListeners) listener({ stream, text });
  }
}

// ---------------------------------------------------------------------------
// ContractRunner
// ---------------------------------------------------------------------------

export interface ContractRunnerOptions {
  secretStore: SecretStore;
  /** Resolved before any command runs when the current contract hash
   * doesn't match `TrustContext.trustedHash` (TP-008). Resolving `false`
   * blocks execution with `ContractTrustDeniedError`. Persisting the
   * newly-confirmed hash is the caller's responsibility — out of scope
   * here (see TP-008: "the actual trust-storage mechanism"). */
  confirmTrust: () => Promise<boolean>;
  /** Override for the source of the least-privilege base env allowlist.
   * Defaults to `process.env`; tests can pass a synthetic one. */
  hostEnv?: NodeJS.ProcessEnv;
}

/** Vars every spawned process needs regardless of contract config — OS
 * plumbing, not secrets. Everything else must come from `environment.vars`
 * or be resolved by name through the injected `SecretStore`; contract
 * commands never inherit the caller's full `process.env` (TP-008
 * least-privilege). */
const BASE_ENV_ALLOWLIST = ["PATH", "Path", "SystemRoot", "PATHEXT", "COMSPEC", "TEMP", "TMP", "HOME", "USERPROFILE"];

function minimalBaseEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BASE_ENV_ALLOWLIST) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** The execution layer over a project's contract commands (TP-004): argv-only
 * `execa` spawns, TOFU trust gating (TP-008) before every run, least-privilege
 * env via the injected `SecretStore`, tree-kill on stop, port-liveness
 * readiness, and health-checked restart for long-running `dev` processes
 * (T-011). */
export class ContractRunner {
  private readonly baseEnv: Record<string, string>;

  constructor(private readonly options: ContractRunnerOptions) {
    this.baseEnv = minimalBaseEnv(options.hostEnv ?? process.env);
  }

  /** Run a one-shot contract command (test/lint/seed/migrate/build) to
   * completion. Never throws on a non-zero exit — inspect `exitCode`. */
  async runCommand(request: RunCommandRequest): Promise<CommandResult> {
    await this.ensureTrusted(request.trust);
    const env = await this.resolveEnv(request.environment);

    const subprocess = execa(request.argv[0] as string, request.argv.slice(1), {
      cwd: request.cwd,
      env,
      extendEnv: false,
      reject: false,
      detached: process.platform !== "win32",
      cleanup: true,
    });

    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (request.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        if (subprocess.pid !== undefined) void killProcessTree(subprocess.pid);
      }, request.timeoutMs);
    }

    try {
      const result = await subprocess;
      return {
        exitCode: result.exitCode ?? null,
        signal: (result.signal as NodeJS.Signals | undefined) ?? null,
        stdout: typeof result.stdout === "string" ? result.stdout : "",
        stderr: typeof result.stderr === "string" ? result.stderr : "",
        timedOut,
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Start a long-running `dev` process: tree-killable, restart-on-crash
   * (bounded, per `RestartPolicy`), and port-liveness aware. */
  async startDevProcess(request: StartDevProcessRequest): Promise<ManagedDevProcess> {
    await this.ensureTrusted(request.trust);
    const env = await this.resolveEnv(request.environment);
    return new DevProcessManager(request.argv, request.cwd, env, request.portLiveness, request.restart);
  }

  private async ensureTrusted(trust: TrustContext): Promise<void> {
    const findings = checkContractTrusted(trust.artifactId, trust.contract, trust.trustedHash ?? "");
    if (findings.length === 0) return;
    const confirmed = await this.options.confirmTrust();
    if (!confirmed) {
      const message = findings[0]?.message ?? "contract trust confirmation was declined";
      throw new ContractTrustDeniedError(message);
    }
  }

  private async resolveEnv(environment: EnvironmentConfig | undefined): Promise<Record<string, string>> {
    const env: Record<string, string> = { ...this.baseEnv };
    for (const [key, value] of Object.entries(environment?.vars ?? {})) {
      env[key] = value;
    }
    for (const name of environment?.secrets ?? []) {
      const value = await this.options.secretStore.get(name);
      if (value !== undefined) env[name] = value;
    }
    return env;
  }
}
