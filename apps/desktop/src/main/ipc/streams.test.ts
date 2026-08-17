import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamsBackend } from "../backend/streams.js";
import { streamsHandlers, streamsSources } from "./streams.js";

// Covers the thin IPC-wiring layer itself (streamsHandlers/streamsSources
// shape their StreamsBackend calls into the {streams.*} request/response
// envelopes contract/streams.ts declares) — StreamsBackend's own domain
// logic has its own coverage in ../backend/streams.test.ts. Handlers are
// typed to (possibly) return a Promise per RequestHandlers, so every call is
// awaited even though this domain's implementations are synchronous.

describe("streamsHandlers / streamsSources", () => {
  let backend: StreamsBackend;
  let handlers: ReturnType<typeof streamsHandlers>;
  let sources: ReturnType<typeof streamsSources>;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new StreamsBackend();
    handlers = streamsHandlers(backend);
    sources = streamsSources(backend);
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it("streams.list wraps listStreams in { streams }", async () => {
    const result = await handlers["streams.list"]({ projectId: "seed-equipment-inspections" });
    expect(result).toEqual({ streams: backend.listStreams("seed-equipment-inspections") });
    expect(result.streams.length).toBeGreaterThan(0);
  });

  it("streams.get wraps getStream in { stream }, null for a missing id", async () => {
    expect(await handlers["streams.get"]({ id: "does-not-exist" })).toEqual({ stream: null });
    const known = await handlers["streams.get"]({ id: "seed-stream-offline-capture" });
    expect(known.stream?.id).toBe("seed-stream-offline-capture");
  });

  it("streams.getDial / streams.setDial round-trip through the backend", async () => {
    expect(await handlers["streams.getDial"]({ projectId: "p1" })).toEqual({ dial: "cruise" });
    expect(await handlers["streams.setDial"]({ projectId: "p1", dial: "auto" })).toEqual({
      dial: "auto",
    });
    expect(await handlers["streams.getDial"]({ projectId: "p1" })).toEqual({ dial: "auto" });
  });

  it("streams.answerQuestion / streams.steer / streams.remediate wrap the resulting stream", async () => {
    const answered = await handlers["streams.answerQuestion"]({
      streamId: "seed-stream-report-export",
      questionId: "q-sync-conflict",
      answer: "Ask the user",
    });
    expect(answered.stream.status).toBe("running");

    const steered = await handlers["streams.steer"]({
      streamId: "seed-stream-offline-capture",
      instruction: "Use the existing date utils",
    });
    expect(steered.stream.notes[0]).toContain("Use the existing date utils");

    const remediated = await handlers["streams.remediate"]({
      streamId: "seed-stream-sync-conflict-resolution",
      action: "retry",
    });
    expect(remediated.stream.status).toBe("running");
  });

  it("streams.listDialWaived / streams.markDialWaivedReviewed wrap the dial-waived list", async () => {
    await handlers["streams.setDial"]({ projectId: "seed-equipment-inspections", dial: "auto" });
    vi.advanceTimersByTime(3_000 * 3);

    const listed = await handlers["streams.listDialWaived"]({
      projectId: "seed-equipment-inspections",
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]!.reviewed).toBe(false);

    const marked = await handlers["streams.markDialWaivedReviewed"]({ id: listed.items[0]!.id });
    expect(marked.item.reviewed).toBe(true);
  });

  it("streams.events source subscribes to and unsubscribes from the backend", async () => {
    const received: unknown[] = [];
    const stop = sources["streams.events"](
      { projectId: "seed-field-sync-api" },
      (event) => received.push(event),
    );

    await handlers["streams.remediate"]({
      streamId: "seed-stream-sync-conflict-resolution",
      action: "retry",
    });
    expect(received).toHaveLength(1);

    stop();
    await handlers["streams.steer"]({
      streamId: "seed-stream-offline-capture",
      instruction: "keep going",
    });
    expect(received).toHaveLength(1); // unaffected: different project, and unsubscribed anyway
  });
});
