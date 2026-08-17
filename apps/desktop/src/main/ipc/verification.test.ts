import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verificationHandlers, verificationSources } from "./verification.js";
import { VerificationBackend } from "../backend/verification.js";
import type { VerificationUpdate } from "../../shared/ipc/contract/verification.js";

// Exercises the handler/source maps this domain contributes to ipc.ts's
// composed RequestHandlers/ChannelSources -- against a real
// VerificationBackend (no Electron, no router needed; router.test.ts covers
// the generic dispatch/validation machinery those maps plug into).

describe("verification IPC wiring", () => {
  let backend: VerificationBackend;
  let handlers: ReturnType<typeof verificationHandlers>;
  let sources: ReturnType<typeof verificationSources>;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new VerificationBackend();
    handlers = verificationHandlers(backend);
    sources = verificationSources(backend);
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it("preview.get/refresh round-trip through the backend", async () => {
    const got = await handlers["verification.preview.get"]({ targetId: "demo-story-offline-sync" });
    expect(got.preview.targetId).toBe("demo-story-offline-sync");

    const refreshed = await handlers["verification.preview.refresh"]({ targetId: "demo-story-offline-sync" });
    expect(refreshed.preview.dataState).toBe("seeded");
  });

  it("tests.get returns null until tests.start has run", async () => {
    const before = await handlers["verification.tests.get"]({ targetId: "demo-story-offline-sync" });
    expect(before.run).toBeNull();

    const started = await handlers["verification.tests.start"]({ targetId: "demo-story-offline-sync" });
    expect(started.run.status).toBe("pending");
  });

  it("tests.rerunCase surfaces the backend's error for an unknown case", async () => {
    await handlers["verification.tests.start"]({ targetId: "demo-story-offline-sync" });
    // Handlers here are called directly (bypassing the router's try/catch in
    // registerIpcRouter — that wrapping is router.test.ts's concern), so a
    // synchronous backend throw surfaces as a synchronous throw, not a
    // rejected promise.
    expect(() =>
      handlers["verification.tests.rerunCase"]({ targetId: "demo-story-offline-sync", caseId: "nope" }),
    ).toThrow();
  });

  it("acceptance.decide surfaces the backend's gate synchronously", () => {
    expect(() =>
      handlers["verification.acceptance.decide"]({ targetId: "demo-story-offline-sync", decision: "accepted" }),
    ).toThrow();
  });

  it("acceptance.waive then acceptance.decide succeeds once every criterion clears", async () => {
    const { checklist } = await handlers["verification.acceptance.get"]({ targetId: "demo-story-offline-sync" });
    for (const criterion of checklist.criteria) {
      await handlers["verification.acceptance.waive"]({
        targetId: "demo-story-offline-sync",
        criterionId: criterion.id,
        reason: "Verified manually",
      });
    }
    const decided = await handlers["verification.acceptance.decide"]({
      targetId: "demo-story-offline-sync",
      decision: "accepted",
      actor: "Priya",
    });
    expect(decided.checklist.decision).toBe("accepted");
  });

  it("merge.finish surfaces the accept-first gate, then succeeds once accepted", async () => {
    expect(() => handlers["verification.merge.finish"]({ targetId: "demo-story-offline-sync" })).toThrow();

    const { checklist } = await handlers["verification.acceptance.get"]({ targetId: "demo-story-offline-sync" });
    for (const criterion of checklist.criteria) {
      await handlers["verification.acceptance.waive"]({
        targetId: "demo-story-offline-sync",
        criterionId: criterion.id,
        reason: "Verified manually",
      });
    }
    await handlers["verification.acceptance.decide"]({ targetId: "demo-story-offline-sync", decision: "accepted" });

    const combining = await handlers["verification.merge.finish"]({ targetId: "demo-story-offline-sync" });
    expect(combining.result.status).toBe("combining");
  });

  it("the verification.updates source subscribes and unsubscribes through the backend", async () => {
    const events: VerificationUpdate[] = [];
    const stop = sources["verification.updates"]({ targetId: "demo-story-offline-sync" }, (e) => events.push(e));

    await handlers["verification.tests.start"]({ targetId: "demo-story-offline-sync" });
    expect(events.length).toBeGreaterThan(0);

    stop();
    const countAfterStop = events.length;
    await vi.advanceTimersByTimeAsync(200 + 350 * 4);
    expect(events.length).toBe(countAfterStop);
  });
});
