import type { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { JsonRpcConnection } from "./jsonrpc.js";
import type { Scenario } from "./scenario.js";

// The methods this skeleton answers — the subset of ACP needed to prove a
// handshake + one scripted prompt turn (SPEC.md §6/§8's vocabulary:
// initialize, session/new, session/prompt, session/update). session/load,
// session/cancel, session/request_permission, and tool-call replay grow with
// later milestones' scenario needs.
const METHOD = {
  initialize: "initialize",
  sessionNew: "session/new",
  sessionPrompt: "session/prompt",
  sessionUpdate: "session/update",
} as const;

export interface StubAgentOptions {
  scenario: Scenario;
  input: Readable;
  output: Writable;
}

// A scripted ACP agent: real JSON-RPC framing over stdio, replaying one
// scenario's session/update sequence for every session/prompt call it
// receives. No live model anywhere (TECH-STACK T-013).
export class StubAgent {
  private readonly scenario: Scenario;
  private readonly conn: JsonRpcConnection;
  private sessionId: string | null = null;

  constructor(opts: StubAgentOptions) {
    this.scenario = opts.scenario;
    this.conn = new JsonRpcConnection(opts.input, opts.output, {
      onRequest: (method, params) => this.handleRequest(method, params),
      onNotification: () => {
        // no inbound notifications handled by this skeleton yet
      },
    });
  }

  private async handleRequest(method: string, _params: unknown): Promise<unknown> {
    switch (method) {
      case METHOD.initialize:
        return {
          protocolVersion: 1,
          agentCapabilities: { loadSession: false, promptCapabilities: {} },
        };

      case METHOD.sessionNew:
        this.sessionId = randomUUID();
        return { sessionId: this.sessionId };

      case METHOD.sessionPrompt:
        return this.replayScenario();

      default:
        throw new Error(`stub-agent: unhandled method "${method}"`);
    }
  }

  private async replayScenario(): Promise<{ stopReason: Scenario["stopReason"] }> {
    for (const update of this.scenario.updates) {
      this.conn.notify(METHOD.sessionUpdate, {
        sessionId: this.sessionId,
        update,
      });
    }
    return { stopReason: this.scenario.stopReason };
  }
}
