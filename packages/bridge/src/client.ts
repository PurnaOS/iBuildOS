import type { Readable, Writable } from "node:stream";
import { AGUIMapper } from "./mapper.js";
import { JsonRpcClientConnection } from "./jsonrpc-client.js";
import type { AGUIEvent } from "./ag-ui-events.js";
import { encodePermissionAnswer, type PermissionRequestParams } from "./permission.js";

// Wires the pure mapper (mapper.ts) to a real ACP connection over stdio. This
// is the minimal ACP *client* needed to drive the bridge's event mapping
// against a real child process (the stub agent, per the task's spawn
// pattern) — not the eventual production ACP client, which is
// `packages/acp`'s M3 scope. Deliberately independent of that package (see
// jsonrpc-client.ts) and of `apps/desktop`'s IPC (out of boundary this
// round — see README.md).

export interface AcpBridgeClientOptions {
  input: Readable; // the agent process's stdout
  output: Writable; // the agent process's stdin
  onEvent: (event: AGUIEvent) => void;
}

interface PendingPermission {
  resolve: (result: ReturnType<typeof encodePermissionAnswer>) => void;
}

export class AcpBridgeClient {
  readonly mapper = new AGUIMapper();
  private readonly conn: JsonRpcClientConnection;
  private sessionId: string | null = null;
  // Keyed by the *stringified* wire id, matching HitlInterruptEvent's
  // `interruptId` (mapper.ts / permission.ts both do `String(requestId)`) —
  // the wire id itself may be numeric (legal JSON-RPC; some ACP adapters
  // number their outbound requests), so this must not key on the raw
  // `string | number` or a numeric id would never correlate back to
  // `answerPermission`'s stringified lookup.
  private readonly pendingPermissions = new Map<string, PendingPermission>();

  constructor(private readonly opts: AcpBridgeClientOptions) {
    this.conn = new JsonRpcClientConnection(opts.input, opts.output, {
      onRequest: (method, params, id) => this.handleInboundRequest(method, params, id),
      onNotification: (method, params) => this.handleNotification(method, params),
    });
  }

  private handleInboundRequest(
    method: string,
    params: unknown,
    id: string | number,
  ): Promise<unknown> {
    if (method === "session/request_permission") {
      const p = params as PermissionRequestParams;
      for (const evt of this.mapper.handlePermissionRequest(id, p)) this.opts.onEvent(evt);
      return new Promise((resolve) => {
        this.pendingPermissions.set(String(id), { resolve });
      });
    }
    return Promise.reject(new Error(`bridge client: unhandled inbound request "${method}"`));
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update") return;
    const p = params as { sessionId?: string; update: { kind: string; data: unknown } };
    for (const evt of this.mapper.handleSessionUpdate(p.update)) this.opts.onEvent(evt);
  }

  initialize(): Promise<unknown> {
    return this.conn.request("initialize", {});
  }

  async newSession(): Promise<string> {
    const result = (await this.conn.request("session/new", {})) as { sessionId: string };
    this.sessionId = result.sessionId;
    return this.sessionId;
  }

  /**
   * Send one `session/prompt` turn. `content`, if given, is carried as a
   * single text content block — the shape a human's fenced `ibuildos:answer`
   * (component.ts's `encodeComponentAnswer`) rides back in, per FORMATS §10
   * ("Answers return in the next session/prompt"). Returns both the exact
   * request payload written to the wire (so tests can assert on it directly —
   * the stub agent's `session/prompt` handler ignores params and can't report
   * back what it received) and the turn's result.
   */
  async prompt(content?: string): Promise<{ sent: Record<string, unknown>; result: unknown }> {
    for (const evt of this.mapper.startTurn()) this.opts.onEvent(evt);
    const sent: Record<string, unknown> = {
      sessionId: this.sessionId,
      prompt: content !== undefined ? [{ type: "text", text: content }] : [],
    };
    const result = await this.conn.request("session/prompt", sent);
    const stopReason = (result as { stopReason?: string } | undefined)?.stopReason ?? "end_turn";
    for (const evt of this.mapper.endTurn(stopReason)) this.opts.onEvent(evt);
    return { sent, result };
  }

  /**
   * The human's answer to a HITL_INTERRUPT: writes the JSON-RPC result the
   * agent's pending `sendRequest(session/request_permission)` is awaiting,
   * unblocking its replay (stub-agent's agent.ts).
   */
  answerPermission(interruptId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(interruptId);
    if (!pending) {
      throw new Error(`bridge client: no pending permission request with id ${interruptId}`);
    }
    this.pendingPermissions.delete(interruptId);
    pending.resolve(encodePermissionAnswer(optionId));
  }
}
