import { describe, expect, it } from "vitest";
import {
  classifyThrottleError,
  initialThrottleState,
  onProgress,
  onThrottle,
  runWithBackpressure,
} from "../src/backpressure.js";
import { makeFakeClock } from "./helpers.js";

// BD-016 — throttling is backpressure, not failure. Numbers are
// DEFAULTS.md #9: backoff 30s → 2m → 5m → 10m (jittered), concurrency
// halves after the 2nd consecutive throttle, escalate after 60 min without
// progress.

describe("classifyThrottleError", () => {
  it("recognizes rate-limit-shaped messages", () => {
    expect(classifyThrottleError(new Error("rate limit exceeded (429): too many requests"))).toBe(true);
    expect(classifyThrottleError(new Error("Too Many Requests"))).toBe(true);
    expect(classifyThrottleError({ code: 429, message: "nope" })).toBe(true);
  });

  it("does not classify an ordinary failure as throttling", () => {
    expect(classifyThrottleError(new Error("file not found"))).toBe(false);
    expect(classifyThrottleError(new Error("permission denied"))).toBe(false);
  });
});

describe("onThrottle (pure state machine)", () => {
  it("follows the 30s→2m→5m→10m backoff schedule with zero jitter", () => {
    let state = initialThrottleState(0);
    const noJitter = () => 0.5; // midpoint of [-1,1] jitter range == 0

    let result = onThrottle(state, 0, noJitter);
    expect(result.action).toMatchObject({ kind: "retry", delayMs: 30_000 });
    state = result.state;

    result = onThrottle(state, 30_000, noJitter);
    expect(result.action).toMatchObject({ kind: "retry", delayMs: 120_000, concurrencyMultiplier: 0.5 });
    state = result.state;

    result = onThrottle(state, 150_000, noJitter);
    expect(result.action).toMatchObject({ kind: "retry", delayMs: 300_000 });
    state = result.state;

    result = onThrottle(state, 450_000, noJitter);
    expect(result.action).toMatchObject({ kind: "retry", delayMs: 600_000 });
    state = result.state;

    // Caps at the 10-minute step for further consecutive throttles.
    result = onThrottle(state, 1_050_000, noJitter);
    expect(result.action).toMatchObject({ kind: "retry", delayMs: 600_000 });
  });

  it("halves concurrency starting at the 2nd consecutive throttle, not the 1st", () => {
    let state = initialThrottleState(0);
    const r1 = onThrottle(state, 0, () => 0.5);
    expect(r1.action.concurrencyMultiplier).toBe(1);
    state = r1.state;
    const r2 = onThrottle(state, 1, () => 0.5);
    expect(r2.action.concurrencyMultiplier).toBe(0.5);
  });

  it("emits an aggregate-notice flag only on the first throttle of an episode", () => {
    let state = initialThrottleState(0);
    const r1 = onThrottle(state, 0, () => 0.5);
    expect(r1.action.kind === "retry" && r1.action.aggregateNotice).toBe(true);
    state = r1.state;
    const r2 = onThrottle(state, 1, () => 0.5);
    expect(r2.action.kind === "retry" && r2.action.aggregateNotice).toBe(false);
  });

  it("escalates after 60 minutes without progress", () => {
    const state = initialThrottleState(0);
    const result = onThrottle(state, 60 * 60 * 1000, () => 0.5);
    expect(result.action.kind).toBe("escalate");
  });

  it("onProgress resets the streak and concurrency", () => {
    let state = initialThrottleState(0);
    state = onThrottle(state, 0, () => 0.5).state;
    state = onThrottle(state, 1, () => 0.5).state;
    expect(state.concurrencyMultiplier).toBe(0.5);

    const recovered = onProgress(state, 2);
    expect(recovered).toEqual({
      consecutiveThrottles: 0,
      concurrencyMultiplier: 1,
      streakStartedAt: null,
      lastProgressAt: 2,
    });
  });
});

describe("runWithBackpressure (fake clock — no real sleeping)", () => {
  it("retries a throttle-classified failure and eventually succeeds", async () => {
    const { clock, waits } = makeFakeClock();
    let calls = 0;
    const op = async () => {
      calls += 1;
      if (calls <= 2) throw new Error("rate limit exceeded (429)");
      return "ok";
    };

    const notices: Array<{ attempt: number; delayMs: number }> = [];
    const result = await runWithBackpressure(op, {
      clock,
      onAggregateNotice: (n) => notices.push(n),
    });

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(waits).toEqual([30_000, 120_000]); // zero jitter from the fake clock's random()
    // BD-016: ONE aggregate notice per episode, not one per retry.
    expect(notices).toHaveLength(1);
  });

  it("rethrows a non-throttle error immediately, with no retry", async () => {
    const { clock, waits } = makeFakeClock();
    const op = async () => {
      throw new Error("file not found");
    };
    await expect(runWithBackpressure(op, { clock })).rejects.toThrow("file not found");
    expect(waits).toEqual([]);
  });

  it("calls onEscalate and rethrows once 60 minutes pass without progress", async () => {
    const { clock, advance } = makeFakeClock();
    let escalated: unknown;
    const op = async () => {
      // Each failed attempt "spends" 20 minutes of simulated time so the
      // 60-minute-without-progress threshold is crossed deterministically
      // without depending on the retry delays alone.
      advance(20 * 60 * 1000);
      throw new Error("rate limit exceeded (429)");
    };

    await expect(
      runWithBackpressure(op, {
        clock,
        maxAttempts: 10,
        onEscalate: (err) => {
          escalated = err;
        },
      }),
    ).rejects.toThrow("rate limit exceeded");
    expect(escalated).toBeInstanceOf(Error);
  });
});
