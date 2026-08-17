import type { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

// Line-delimited JSON-RPC 2.0 over stdio, client role: the bridge's side of
// the wire talking to an agent process. Independently written for this
// package rather than imported from `@ibuildos/stub-agent` — that package is
// a read-only test double (T-013), and the bridge's production surface
// (mapper.ts, component.ts, permission.ts) has no dependency on it; only the
// test harness (client.ts + fixtures/run-scenario.ts) spawns it.
//
// Differs from stub-agent's `JsonRpcConnection` in one deliberate way: an
// *inbound* request (the agent-initiated `session/request_permission`) needs
// its wire id surfaced to the caller so the eventual answer can be written
// back with that exact id — the handler here receives it as a third
// argument, resolved later rather than synchronously.

export type ClientRequestHandler = (
  method: string,
  params: unknown,
  id: string | number,
) => Promise<unknown>;

export type ClientNotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface RawMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class JsonRpcClientConnection {
  private readonly output: Writable;
  private readonly onRequest: ClientRequestHandler;
  private readonly onNotification: ClientNotificationHandler;
  private closed = false;
  // Plain numeric ids in their own namespace — distinct from whatever scheme
  // the peer uses for its own outbound requests (stub-agent uses `agent-N`
  // strings), so the two id spaces never collide on one connection.
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingRequest>();

  constructor(
    input: Readable,
    output: Writable,
    handlers: { onRequest: ClientRequestHandler; onNotification: ClientNotificationHandler },
  ) {
    this.output = output;
    this.onRequest = handlers.onRequest;
    this.onNotification = handlers.onNotification;

    const rl = createInterface({ input, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      void this.handleLine(line);
    });
    rl.on("close", () => {
      this.closed = true;
      for (const p of this.pending.values()) {
        p.reject(new Error("bridge: connection closed with a request still pending"));
      }
      this.pending.clear();
    });
  }

  private async handleLine(line: string): Promise<void> {
    let msg: RawMessage;
    try {
      msg = JSON.parse(line) as RawMessage;
    } catch {
      return; // malformed frame — not this transport's concern to recover
    }

    if (msg.method !== undefined && msg.id !== undefined) {
      // Inbound request (agent-initiated, e.g. session/request_permission).
      try {
        const result = await this.onRequest(msg.method, msg.params, msg.id);
        this.write({ jsonrpc: "2.0", id: msg.id, result });
      } catch (err) {
        this.write({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        });
      }
      return;
    }

    if (msg.method !== undefined) {
      this.onNotification(msg.method, msg.params);
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) return; // unsolicited/late response — ignore
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
    }
  }

  /** Correlated outbound request (initialize, session/new, session/prompt). */
  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("bridge: cannot send a request on a closed connection"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Fire-and-forget outbound notification (no id, no response expected). Unused by the bridge today; kept for symmetry with a full JSON-RPC connection. */
  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(value: unknown): void {
    if (this.closed) return;
    this.output.write(`${JSON.stringify(value)}\n`);
  }
}
