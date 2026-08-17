import { afterEach, describe, expect, it } from "vitest";
import { AcpClient, spawnCommandAgent } from "../src/client.js";
import { runWithBackpressure } from "../src/backpressure.js";
import { fixturePath, makeFakeClock, makeTempDir } from "./helpers.js";

// BD-016 — a real 429-shaped JSON-RPC error over real stdio (from
// test/fixtures/throttle-agent.mjs — see its doc comment for why
// packages/stub-agent can't drive this: no error-injection mechanism
// exists there) triggers backpressure (retry + backoff + one aggregate
// notice), not a hard failure, and the turn eventually succeeds.

describe("throttle / rate-limit triggers BD-016 backpressure, not a hard failure", () => {
  let client: AcpClient | null = null;

  afterEach(() => {
    client?.close();
    client = null;
  });

  it("retries a real rate-limited session/prompt call and eventually succeeds", async () => {
    const worktree = makeTempDir("throttle-flow");
    client = spawnCommandAgent(process.execPath, [fixturePath("throttle-agent.mjs"), "2"], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "deny",
    });

    await client.initialize();
    const session = await client.newSession(worktree);

    const { clock, waits } = makeFakeClock();
    const notices: Array<{ attempt: number; delayMs: number }> = [];
    const concurrencyChanges: number[] = [];

    const { response } = await runWithBackpressure(() => session.promptAndDrain("go"), {
      clock,
      onAggregateNotice: (n) => notices.push(n),
      onConcurrencyChange: (m) => concurrencyChanges.push(m),
      maxAttempts: 5,
    });

    expect(response.stopReason).toBe("end_turn");
    // The fixture fails exactly twice (argv[2] = "2") then succeeds — real
    // wire errors, real retries, no real sleeping (the fake clock's `wait`
    // resolves instantly).
    expect(waits).toEqual([30_000, 120_000]);
    // BD-016: ONE aggregate notice for the whole episode, not one per retry.
    expect(notices).toHaveLength(1);
    // Concurrency halves after the 2nd consecutive throttle, then recovers
    // to 1x once the turn finally succeeds (onProgress).
    expect(concurrencyChanges).toEqual([1, 0.5, 1]);
  });

  it("does not treat throttling as a stream failure the caller must handle as an error", async () => {
    const worktree = makeTempDir("throttle-no-fail");
    client = spawnCommandAgent(process.execPath, [fixturePath("throttle-agent.mjs"), "1"], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "deny",
    });

    await client.initialize();
    const session = await client.newSession(worktree);
    const { clock } = makeFakeClock();

    await expect(
      runWithBackpressure(() => session.promptAndDrain("go"), { clock, maxAttempts: 3 }),
    ).resolves.toMatchObject({ response: { stopReason: "end_turn" } });
  });
});
