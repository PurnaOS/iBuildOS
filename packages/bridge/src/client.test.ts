import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { AcpBridgeClient } from "./client.js";
import type { AGUIEvent } from "./ag-ui-events.js";

interface Line {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

function collectLine(stream: PassThrough, predicate: (l: Line) => boolean): Promise<Line> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timeout = setTimeout(
      () => reject(new Error("timed out waiting for a matching JSON-RPC line")),
      2000,
    );
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!raw.trim()) continue;
        const parsed = JSON.parse(raw) as Line;
        if (predicate(parsed)) {
          clearTimeout(timeout);
          resolve(parsed);
          return;
        }
      }
    });
  });
}

// Drives AcpBridgeClient directly over PassThrough streams (no child process)
// to pin the session/request_permission correlation contract: the wire id an
// agent uses to number its outbound request may be a JSON *number* (legal
// JSON-RPC), not just stub-agent's own "agent-N" string convention. The
// HITL_INTERRUPT event's `interruptId` is always a string (mapper.ts
// stringifies it for a uniform AG-UI-side type), so the client's pending-
// permission bookkeeping must key on the stringified id throughout, or a
// numeric-id agent's request would never unblock.
describe("AcpBridgeClient — session/request_permission correlation", () => {
  it("answers a numeric wire id correctly, writing back {id: <original number>, result}", async () => {
    const input = new PassThrough(); // simulated agent -> bridge
    const output = new PassThrough(); // bridge -> simulated agent
    const events: AGUIEvent[] = [];
    const client = new AcpBridgeClient({
      input,
      output,
      onEvent: (e) => events.push(e),
    });

    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 42,
        method: "session/request_permission",
        params: {
          toolCall: { toolCallId: "tc-1" },
          options: [{ id: "allow", label: "Allow" }],
        },
      })}\n`,
    );

    // Let the interrupt propagate before answering.
    await new Promise((resolve) => setImmediate(resolve));
    const interrupt = events.find((e) => e.type === "HITL_INTERRUPT") as
      | { interruptId: string }
      | undefined;
    expect(interrupt?.interruptId).toBe("42");

    const responsePromise = collectLine(output, (l) => l.id === 42);
    client.answerPermission(interrupt!.interruptId, "allow");

    const response = await responsePromise;
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ outcome: "selected", optionId: "allow" });
  });

  it("throws a clear error when answering an id with no pending permission request", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const client = new AcpBridgeClient({ input, output, onEvent: () => {} });
    expect(() => client.answerPermission("does-not-exist", "allow")).toThrow(/no pending permission/);
  });
});
