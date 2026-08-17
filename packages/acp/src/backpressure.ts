import type { Clock } from "./types.js";

// BD-016 — throttling is backpressure, not failure. Rate limiting and
// transient agent errors pause the affected stream with automatic retry and
// backoff, temporarily reduce global concurrency, and surface as one
// aggregate notice, not a per-stream red failure. Only sustained failure
// past a retry budget escalates to BD-013.
//
// Numbers are DEFAULTS.md #9 (not invented here): backoff 30s → 2m → 5m →
// 10m (jittered), global concurrency halves after the 2nd consecutive
// throttle, escalate after 60 min without progress.

export interface ThrottleState {
  consecutiveThrottles: number;
  concurrencyMultiplier: number; // 1 or 0.5
  streakStartedAt: number | null;
  lastProgressAt: number;
}

export function initialThrottleState(now: number): ThrottleState {
  return { consecutiveThrottles: 0, concurrencyMultiplier: 1, streakStartedAt: null, lastProgressAt: now };
}

const BACKOFF_SCHEDULE_MS = [30_000, 120_000, 300_000, 600_000]; // 30s, 2m, 5m, 10m
const ESCALATE_AFTER_MS = 60 * 60 * 1000; // 60 min without progress
const JITTER_RATIO = 0.2; // ±20%

export type BackpressureAction =
  | { kind: "retry"; delayMs: number; concurrencyMultiplier: number; aggregateNotice: boolean }
  | { kind: "escalate"; concurrencyMultiplier: number };

/** Pure state transition — no timers, no I/O, so it's directly assertable
 * without faking the clock. `runWithBackpressure` below is what actually
 * waits, using an injected `Clock`. */
export function onThrottle(
  state: ThrottleState,
  now: number,
  random: () => number,
): { state: ThrottleState; action: BackpressureAction } {
  const consecutiveThrottles = state.consecutiveThrottles + 1;
  const streakStartedAt = state.streakStartedAt ?? now;
  const concurrencyMultiplier = consecutiveThrottles >= 2 ? 0.5 : state.concurrencyMultiplier;
  const next: ThrottleState = {
    consecutiveThrottles,
    concurrencyMultiplier,
    streakStartedAt,
    lastProgressAt: state.lastProgressAt,
  };

  if (now - state.lastProgressAt >= ESCALATE_AFTER_MS) {
    return { state: next, action: { kind: "escalate", concurrencyMultiplier } };
  }

  const idx = Math.min(consecutiveThrottles - 1, BACKOFF_SCHEDULE_MS.length - 1);
  const base = BACKOFF_SCHEDULE_MS[idx]!;
  const jitter = base * JITTER_RATIO * (random() * 2 - 1); // ±20%, symmetric
  const delayMs = Math.max(0, Math.round(base + jitter));

  return {
    state: next,
    action: {
      kind: "retry",
      delayMs,
      concurrencyMultiplier,
      // One aggregate notice per throttle *episode* (its first occurrence),
      // not one per retry attempt — BD-016's "one aggregate notice, not
      // per-stream red failures".
      aggregateNotice: consecutiveThrottles === 1,
    },
  };
}

export function onProgress(_state: ThrottleState, now: number): ThrottleState {
  return { consecutiveThrottles: 0, concurrencyMultiplier: 1, streakStartedAt: null, lastProgressAt: now };
}

const THROTTLE_PATTERN = /rate.?limit|too many requests|\b429\b|throttl/i;

/**
 * Classifies an error as a provider-throttle signal vs. a hard failure.
 *
 * Neither SPEC.md nor TECH-STACK.md standardizes a rate-limit error shape
 * over ACP — BD-016 only says "as surfaced via ACP or agent exit behavior".
 * This pattern-match against the error's message/code is this package's own
 * heuristic (a genuine judgment call — see the package README for the
 * DC-#### decision this is flagged for) and errs toward *not*
 * misclassifying a real failure as throttling: it requires an explicit
 * rate-limit-shaped signal rather than treating every error as backpressure.
 */
export function classifyThrottleError(err: unknown): boolean {
  const message = errorMessage(err);
  if (THROTTLE_PATTERN.test(message)) return true;
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "number" && code === 429;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export interface BackpressureRunOptions {
  clock: Clock;
  onAggregateNotice?: (notice: { attempt: number; delayMs: number }) => void;
  onEscalate?: (err: unknown) => void;
  onConcurrencyChange?: (multiplier: number) => void;
  /** Safety cap, mainly for tests — real usage relies on the 60-minute
   * escalation instead of an attempt count. */
  maxAttempts?: number;
}

/** Runs `op`, retrying with BD-016 backoff on throttle-classified errors
 * until it succeeds, escalates (60 min without progress), or `maxAttempts`
 * is exceeded. Any non-throttle error rethrows immediately — backpressure
 * only ever applies to the throttle-classified case. */
export async function runWithBackpressure<T>(op: () => Promise<T>, opts: BackpressureRunOptions): Promise<T> {
  let state = initialThrottleState(opts.clock.now());
  let attempts = 0;
  for (;;) {
    try {
      const result = await op();
      state = onProgress(state, opts.clock.now());
      opts.onConcurrencyChange?.(state.concurrencyMultiplier);
      return result;
    } catch (err) {
      if (!classifyThrottleError(err)) throw err;
      attempts += 1;
      if (opts.maxAttempts != null && attempts > opts.maxAttempts) throw err;

      const { state: next, action } = onThrottle(state, opts.clock.now(), () => opts.clock.random());
      state = next;
      opts.onConcurrencyChange?.(action.concurrencyMultiplier);

      if (action.kind === "escalate") {
        opts.onEscalate?.(err);
        throw err;
      }
      if (action.aggregateNotice) {
        opts.onAggregateNotice?.({ attempt: attempts, delayMs: action.delayMs });
      }
      await opts.clock.wait(action.delayMs);
    }
  }
}
