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

export type JsonRpcInbound = JsonRpcRequest | JsonRpcNotification;

export function isRequest(msg: JsonRpcInbound): msg is JsonRpcRequest {
  return "id" in msg && msg.id !== undefined;
}

export type RequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

export type NotificationHandler = (method: string, params: unknown) => void;

export class JsonRpcConnection {
  private readonly out: Writable;
  private readonly onRequest: RequestHandler;
  private readonly onNotification: NotificationHandler;
  private closed = false;

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
    });
  }

  private async handleLine(line: string): Promise<void> {
    let msg: JsonRpcInbound;
    try {
      msg = JSON.parse(line) as JsonRpcInbound;
    } catch {
      return; // malformed frame — real ACP handling is a later-milestone concern
    }

    if (isRequest(msg)) {
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

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private send(response: JsonRpcResponse): void {
    this.write(response);
  }

  private write(value: unknown): void {
    if (this.closed) return;
    this.out.write(`${JSON.stringify(value)}\n`);
  }
}
