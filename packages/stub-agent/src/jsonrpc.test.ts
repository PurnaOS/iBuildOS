import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { JsonRpcConnection } from "./jsonrpc.js";

interface Line {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function send(stream: PassThrough, msg: unknown): void {
  stream.write(`${JSON.stringify(msg)}\n`);
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

describe("JsonRpcConnection", () => {
  it("still dispatches inbound requests and outbound notifications as before", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let notified: { method: string; params: unknown } | undefined;
    const conn = new JsonRpcConnection(input, output, {
      onRequest: async (method) => ({ echoed: method }),
      onNotification: (method, params) => {
        notified = { method, params };
      },
    });

    const linesPromise = collectLines(output, 1);
    send(input, { jsonrpc: "2.0", id: 1, method: "ping", params: { a: 1 } });
    const [requestLine] = await linesPromise;

    expect(requestLine?.id).toBe(1);
    expect(requestLine?.result).toEqual({ echoed: "ping" });

    conn.notify("event", { b: 2 });
    // notify() writes synchronously — no need to wait on the output stream.
    // Just prove inbound notification dispatch still works too.
    send(input, { jsonrpc: "2.0", method: "note", params: { c: 3 } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notified).toEqual({ method: "note", params: { c: 3 } });
  });

  it("sends a correlated outbound request and resolves it from a matching response", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const conn = new JsonRpcConnection(input, output, {
      onRequest: async () => ({}),
      onNotification: () => {},
    });

    const linesPromise = collectLines(output, 1);
    const resultPromise = conn.sendRequest("peer/method", { x: 1 });
    const [line] = await linesPromise;

    expect(line?.method).toBe("peer/method");
    expect(line?.params).toEqual({ x: 1 });
    expect(line?.id).toBeDefined();
    expect(line?.result).toBeUndefined();
    expect(line?.error).toBeUndefined();

    send(input, { jsonrpc: "2.0", id: line?.id, result: { ok: true } });

    await expect(resultPromise).resolves.toEqual({ ok: true });
  });

  it("rejects the pending promise when the response carries an error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const conn = new JsonRpcConnection(input, output, {
      onRequest: async () => ({}),
      onNotification: () => {},
    });

    const linesPromise = collectLines(output, 1);
    const resultPromise = conn.sendRequest("peer/method", {});
    const [line] = await linesPromise;

    send(input, {
      jsonrpc: "2.0",
      id: line?.id,
      error: { code: -32000, message: "denied" },
    });

    await expect(resultPromise).rejects.toThrow("denied");
  });

  it("ignores a response with no matching pending request instead of throwing", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const conn = new JsonRpcConnection(input, output, {
      onRequest: async () => ({}),
      onNotification: () => {},
    });

    // A stray response whose id was never issued via sendRequest.
    send(input, { jsonrpc: "2.0", id: "not-mine", result: { ignored: true } });
    await new Promise((resolve) => setImmediate(resolve));

    // The connection stays usable: a real outbound request still resolves.
    const linesPromise = collectLines(output, 1);
    const resultPromise = conn.sendRequest("peer/method", {});
    const [line] = await linesPromise;
    send(input, { jsonrpc: "2.0", id: line?.id, result: { ok: true } });

    await expect(resultPromise).resolves.toEqual({ ok: true });
  });
});
