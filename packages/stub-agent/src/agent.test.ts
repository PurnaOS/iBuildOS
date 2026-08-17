import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { StubAgent } from "./agent.js";
import { loadScenario } from "./scenario.js";
import helloWorld from "../scenarios/hello-world.json" with { type: "json" };
import permissionRequestScenario from "../scenarios/permission-request.json" with { type: "json" };
import sessionLoadScenario from "../scenarios/session-load.json" with { type: "json" };

interface Line {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

function collectLines(stream: PassThrough, count: number): Promise<Line[]> {
  return new Promise((resolve, reject) => {
    const lines: Line[] = [];
    let buf = "";
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for ${count} lines, got ${lines.length}`)),
      2000,
    );
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (raw.trim()) lines.push(JSON.parse(raw));
      }
      if (lines.length >= count) {
        clearTimeout(timeout);
        resolve(lines);
      }
    });
  });
}

function send(stream: PassThrough, msg: unknown): void {
  stream.write(`${JSON.stringify(msg)}\n`);
}

// Like collectLines, but lets a test wait for the Nth line matching some
// predicate while still keeping every line seen so far — needed to prove a
// replay genuinely paused partway through (real async ticks), not just that
// N lines eventually arrived.
function watchLines(stream: PassThrough): {
  lines: Line[];
  waitFor: (predicate: (l: Line) => boolean, count: number) => Promise<Line[]>;
} {
  const lines: Line[] = [];
  let buf = "";
  const waiters: Array<{ predicate: (l: Line) => boolean; count: number; resolve: () => void }> =
    [];

  stream.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (raw.trim()) lines.push(JSON.parse(raw));
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i]!;
      if (lines.filter(waiter.predicate).length >= waiter.count) {
        waiter.resolve();
        waiters.splice(i, 1);
      }
    }
  });

  return {
    lines,
    waitFor(predicate, count) {
      if (lines.filter(predicate).length >= count) return Promise.resolve(lines);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`timed out waiting for ${count} matching lines`)),
          2000,
        );
        waiters.push({
          predicate,
          count,
          resolve: () => {
            clearTimeout(timeout);
            resolve(lines);
          },
        });
      });
    },
  };
}

describe("StubAgent", () => {
  it("replays a scripted scenario over real JSON-RPC framing", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(helloWorld);
    new StubAgent({ scenario, input, output });

    // initialize -> session/new -> session/prompt, expect:
    //   1 initialize response, 1 session/new response,
    //   2 session/update notifications (scenario has 2 updates),
    //   1 session/prompt response = 5 lines total.
    const linesPromise = collectLines(output, 5);

    send(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send(input, { jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
    send(input, { jsonrpc: "2.0", id: 3, method: "session/prompt", params: {} });

    const lines = await linesPromise;

    const initResponse = lines.find((l) => l.id === 1);
    expect(initResponse?.result).toMatchObject({ protocolVersion: 1 });

    const sessionResponse = lines.find((l) => l.id === 2);
    expect(sessionResponse?.result).toHaveProperty("sessionId");
    const sessionId = (sessionResponse!.result as { sessionId: string }).sessionId;

    const updates = lines.filter((l) => l.method === "session/update");
    expect(updates).toHaveLength(2);
    expect(updates[0]?.params).toMatchObject({
      sessionId,
      update: { kind: "message_chunk", data: { text: "Hello" } },
    });
    expect(updates[1]?.params).toMatchObject({
      sessionId,
      update: { kind: "message_chunk", data: { text: ", world." } },
    });

    const promptResponse = lines.find((l) => l.id === 3);
    expect(promptResponse?.result).toMatchObject({ stopReason: "end_turn" });
  });

  it("rejects an unhandled method with a JSON-RPC error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(helloWorld);
    new StubAgent({ scenario, input, output });

    const linesPromise = collectLines(output, 1);
    send(input, { jsonrpc: "2.0", id: 1, method: "session/load", params: {} });

    const [line] = await linesPromise;
    expect(line?.error).toBeDefined();
  });
});

describe("StubAgent — session/cancel", () => {
  it("interrupts an in-flight session/prompt replay before it finishes", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario({
      name: "long-replay",
      updates: [
        { kind: "message_chunk", data: { text: "one" } },
        { kind: "message_chunk", data: { text: "two" } },
        { kind: "message_chunk", data: { text: "three" } },
        { kind: "message_chunk", data: { text: "four" } },
        { kind: "message_chunk", data: { text: "five" } },
      ],
      stopReason: "end_turn",
    });
    new StubAgent({ scenario, input, output });
    const watch = watchLines(output);

    send(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send(input, { jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
    send(input, { jsonrpc: "2.0", id: 3, method: "session/prompt", params: {} });

    // Wait for genuine async progress — the replay loop yields (setImmediate)
    // between emissions, so this proves "partway through" is a real
    // interleaving of ticks, not just a synchronous call sequence.
    await watch.waitFor((l) => l.method === "session/update", 1);

    send(input, { jsonrpc: "2.0", id: 4, method: "session/cancel", params: {} });

    await watch.waitFor((l) => l.id === 4, 1);
    await watch.waitFor((l) => l.id === 3, 1);

    const updateCount = watch.lines.filter((l) => l.method === "session/update").length;
    expect(updateCount).toBeGreaterThanOrEqual(1);
    expect(updateCount).toBeLessThan(scenario.updates.length);

    const promptResponse = watch.lines.find((l) => l.id === 3);
    expect(promptResponse?.result).toMatchObject({ stopReason: "cancelled" });

    const cancelResponse = watch.lines.find((l) => l.id === 4);
    expect(cancelResponse?.error).toBeUndefined();
    expect(cancelResponse?.result).toBeDefined();
  });
});

describe("StubAgent — session/request_permission", () => {
  it("pauses the replay for an outbound permission request and resumes only after the client answers", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(permissionRequestScenario);
    new StubAgent({ scenario, input, output });
    const watch = watchLines(output);

    send(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send(input, { jsonrpc: "2.0", id: 2, method: "session/new", params: {} });
    send(input, { jsonrpc: "2.0", id: 3, method: "session/prompt", params: {} });

    await watch.waitFor((l) => l.method === "session/update", 1);
    await watch.waitFor((l) => l.method === "session/request_permission", 1);

    // Structural check, not a timing fluke: give the replay loop several
    // more ticks to run before answering. If it weren't genuinely blocked
    // on the outbound sendRequest promise (e.g. it fired the request and
    // moved on regardless), these ticks would be enough for updates 3 and 4
    // to land too, and the assertion below would fail.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(watch.lines.filter((l) => l.method === "session/update")).toHaveLength(1);

    const permissionLine = watch.lines.find((l) => l.method === "session/request_permission");
    expect(permissionLine?.id).toBeDefined();
    expect(permissionLine?.params).toMatchObject({
      toolCall: { toolCallId: "tc-1" },
      options: [{ id: "allow" }, { id: "reject" }],
    });

    send(input, {
      jsonrpc: "2.0",
      id: permissionLine?.id,
      result: { outcome: "selected", optionId: "allow" },
    });

    await watch.waitFor((l) => l.id === 3, 1);

    const updates = watch.lines.filter((l) => l.method === "session/update");
    expect(updates).toHaveLength(3);
    expect(updates[2]?.params).toMatchObject({
      update: { kind: "message_chunk", data: { text: "Done." } },
    });

    const promptResponse = watch.lines.find((l) => l.id === 3);
    expect(promptResponse?.result).toMatchObject({ stopReason: "end_turn" });
  });
});

describe("StubAgent — session/load", () => {
  it("errors like an unhandled method when the scenario doesn't opt in", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(helloWorld); // no supportsLoad
    new StubAgent({ scenario, input, output });

    const linesPromise = collectLines(output, 1);
    send(input, { jsonrpc: "2.0", id: 1, method: "session/load", params: { sessionId: "s-1" } });

    const [line] = await linesPromise;
    expect(line?.error).toBeDefined();
  });

  it("replays the transcript-so-far before responding when the scenario opts in", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(sessionLoadScenario);
    new StubAgent({ scenario, input, output });

    const linesPromise = collectLines(output, 3); // 2 session/update + 1 response
    send(input, { jsonrpc: "2.0", id: 1, method: "session/load", params: { sessionId: "s-1" } });
    const lines = await linesPromise;

    const updateIndices = lines
      .map((l, i) => (l.method === "session/update" ? i : -1))
      .filter((i) => i !== -1);
    const responseIndex = lines.findIndex((l) => l.id === 1);

    expect(updateIndices).toHaveLength(2);
    expect(responseIndex).toBeGreaterThan(Math.max(...updateIndices));

    const response = lines.find((l) => l.id === 1);
    expect(response?.result).toMatchObject({ sessionId: "s-1" });
  });

  it("advertises loadSession capability from the scenario at initialize", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const scenario = loadScenario(sessionLoadScenario);
    new StubAgent({ scenario, input, output });

    const linesPromise = collectLines(output, 1);
    send(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const [line] = await linesPromise;

    expect(line?.result).toMatchObject({ agentCapabilities: { loadSession: true } });
  });
});
