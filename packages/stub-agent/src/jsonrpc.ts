import { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

// Line-delimited JSON-RPC 2.0 over stdio — the transport ACP agents speak
// (TECH-STACK.md T-005/T-013). This module is transport-only: framing and
// dispatch, no ACP-specific method knowledge.

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcInbound = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export function isRequest(msg: JsonRpcInbound): msg is JsonRpcRequest {
  if (!("method" in msg)) return false; // rules out a response
  return "id" in msg && msg.id !== undefined;
}

// A response carries an `id` but never a `method` — that's what
// distinguishes it on the wire from a request (id + method) or a
// notification (method, no id).
export function isResponse(msg: JsonRpcInbound): msg is JsonRpcResponse {
  if ("method" in msg) return false;
  return "id" in msg && msg.id !== undefined;
}

export type RequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

export type NotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class JsonRpcConnection {
  private readonly out: Writable;
  private readonly onRequest: RequestHandler;
  private readonly onNotification: NotificationHandler;
  private closed = false;
  private nextRequestId = 1;
  private readonly pending = new Map<string | number, PendingRequest>();

  constructor(
    input: Readable,
    output: Writable,
    handlers: { onRequest: RequestHandler; onNotification: NotificationHandler },
  ) {
    this.out = output;
    this.onRequest = handlers.onRequest;
    this.onNotification = handlers.onNotification;

    const rl = createInterface({ input, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      void this.handleLine(line);
    });
    rl.on("close", () => {
      this.closed = true;
      for (const pending of this.pending.values()) {
        pending.reject(new Error("stub-agent: connection closed with a request still pending"));
      }
      this.pending.clear();
    });
  }

  private async handleLine(line: string): Promise<void> {
    let msg: JsonRpcInbound;
    try {
      msg = JSON.parse(line) as JsonRpcInbound;
    } catch {
      return; // malformed frame — real ACP handling is a later-milestone concern
    }

    if (isResponse(msg)) {
      this.settlePending(msg);
    } else if (isRequest(msg)) {
      try {
        const result = await this.onRequest(msg.method, msg.params);
        this.send({ jsonrpc: "2.0", id: msg.id, result });
      } catch (err) {
        this.send({
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    } else {
      this.onNotification(msg.method, msg.params);
    }
  }

  private settlePending(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return; // no matching outbound request — ignore (unsolicited/late response)
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  // Correlated outbound request: writes a fresh-id request line and resolves
  // once a matching `{id, result}`/`{id, error}` line arrives via
  // handleLine. Ids live in an `agent-N` namespace distinct from whatever
  // scheme the peer uses for its own inbound requests, so the two id spaces
  // never collide on this connection.
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(
        new Error("stub-agent: cannot send a request on a closed connection"),
      );
    }
    const id = `agent-${this.nextRequestId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  private send(response: JsonRpcResponse): void {
    this.write(response);
  }

  private write(value: unknown): void {
    if (this.closed) return;
    this.out.write(`${JSON.stringify(value)}\n`);
  }
}
