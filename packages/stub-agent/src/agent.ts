import type { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { JsonRpcConnection } from "./jsonrpc.js";
import { PermissionRequestDataSchema, type Scenario } from "./scenario.js";

// The methods this skeleton answers — the ACP vocabulary needed to prove a
// handshake, a scripted prompt turn (with cancellation and an agent-
// initiated permission request mid-replay), and session resume (SPEC.md
// §6/§8). Tool-call replay fidelity beyond the scenario's own `tool_call`
// updates grows with later milestones' needs.
const METHOD = {
  initialize: "initialize",
  sessionNew: "session/new",
  sessionLoad: "session/load",
  sessionPrompt: "session/prompt",
  sessionCancel: "session/cancel",
  sessionUpdate: "session/update",
  sessionRequestPermission: "session/request_permission",
} as const;

export interface StubAgentOptions {
  scenario: Scenario;
  input: Readable;
  output: Writable;
}

// A scripted ACP agent: real JSON-RPC framing over stdio, replaying one
// scenario's session/update sequence for every session/prompt call it
// receives. No live model anywhere (TECH-STACK T-013).
interface ReplayToken {
  cancelled: boolean;
}

export class StubAgent {
  private readonly scenario: Scenario;
  private readonly conn: JsonRpcConnection;
  private sessionId: string | null = null;
  // One token per in-flight replayScenario() call, rather than a single
  // shared flag — a stray session/cancel can't cross-talk into a later,
  // unrelated prompt turn once the one it targeted has already finished.
  private activeReplay: ReplayToken | null = null;

  constructor(opts: StubAgentOptions) {
    this.scenario = opts.scenario;
    this.conn = new JsonRpcConnection(opts.input, opts.output, {
      onRequest: (method, params) => this.handleRequest(method, params),
      onNotification: () => {
        // no inbound notifications handled by this skeleton yet
      },
    });
  }

  private async handleRequest(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case METHOD.initialize:
        return {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: this.scenario.supportsLoad,
            promptCapabilities: {},
          },
        };

      case METHOD.sessionNew:
        this.sessionId = randomUUID();
        return { sessionId: this.sessionId };

      case METHOD.sessionLoad:
        if (!this.scenario.supportsLoad) {
          throw new Error(`stub-agent: unhandled method "${method}"`);
        }
        return this.loadSession(params);

      case METHOD.sessionPrompt:
        return this.replayScenario();

      case METHOD.sessionCancel:
        if (this.activeReplay) this.activeReplay.cancelled = true;
        return {};

      default:
        throw new Error(`stub-agent: unhandled method "${method}"`);
    }
  }

  // Stub session/load semantics: there's no real persisted session, so the
  // whole scenario stands in for "the stored transcript" — re-emitted as
  // session/update notifications (mirroring real ACP's resume-then-catch-up
  // shape) before the method resolves. permission_request steps are live
  // control-flow points, not transcript entries, so they're skipped here.
  private loadSession(params: unknown): { sessionId: string } {
    const requested = params as { sessionId?: string } | null | undefined;
    const sessionId = requested?.sessionId ?? randomUUID();
    this.sessionId = sessionId;
    for (const update of this.scenario.updates) {
      if (update.kind === "permission_request") continue;
      this.conn.notify(METHOD.sessionUpdate, { sessionId, update });
    }
    return { sessionId };
  }

  private async replayScenario(): Promise<{ stopReason: Scenario["stopReason"] }> {
    const token: ReplayToken = { cancelled: false };
    this.activeReplay = token;

    for (const update of this.scenario.updates) {
      if (token.cancelled) break;

      if (update.kind === "permission_request") {
        const data = PermissionRequestDataSchema.parse(update.data);
        // Agent-initiated outbound call: block the replay until the client
        // answers, same as a real permission prompt would gate a tool call.
        // Known limitation: a session/cancel arriving while this await is
        // pending does not unblock it — cancellation is only checked
        // between emitted updates, not while a permission request is
        // in-flight.
        await this.conn.sendRequest(METHOD.sessionRequestPermission, {
          sessionId: this.sessionId,
          toolCall: data.toolCall,
          options: data.options,
        });
      } else {
        this.conn.notify(METHOD.sessionUpdate, { sessionId: this.sessionId, update });
      }

      // Yield a tick so a concurrently-arriving session/cancel gets
      // processed between emissions — otherwise this loop runs to
      // completion in one go with no chance to observe cancellation.
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (this.activeReplay === token) this.activeReplay = null;
    return { stopReason: token.cancelled ? "cancelled" : this.scenario.stopReason };
  }
}
