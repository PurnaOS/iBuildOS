import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { StubAgent } from "./agent.js";
import { loadScenario } from "./scenario.js";
import helloWorld from "../scenarios/hello-world.json" with { type: "json" };

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
