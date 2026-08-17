import type { ActiveSession, PromptResponse, SessionNotification, SessionUpdate } from "@agentclientprotocol/sdk";
import type { TranscriptWriter } from "./transcript.js";
import type { SecretRouter } from "./secret-router.js";

// AC-004 — one session per stream/conversation, wrapping the SDK's
// `ActiveSession` with transcript writing (from *validated* notifications —
// spawn.ts's raw-frame tap is the loss-proof complement for adapters whose
// payloads don't validate) and automatic AC-013 secret-request round-trips.

export interface AcpSessionOptions {
  transcript?: TranscriptWriter;
  secretRouter?: SecretRouter;
  /** Safety cap on automatic secret-request round-trips per `promptAndDrain`
   * call (default 3). Without a cap, an agent that keeps re-emitting a
   * secret-request fence — trivially: one that ignores a `{granted: false}`
   * answer and asks again — would spin `promptAndDrain` forever. */
  maxSecretRoundTrips?: number;
}

export interface PromptTurnResult {
  updates: SessionNotification[];
  response: PromptResponse;
  /** Number of automatic secret-request round-trips this call performed
   * before returning (0 for an ordinary turn). */
  secretRoundTrips: number;
}

const DEFAULT_MAX_SECRET_ROUND_TRIPS = 3;

export class AcpSession {
  constructor(
    private readonly active: ActiveSession,
    /** Sends `session/cancel` for this session (AC-004). A plain injected
     * closure rather than exposing the SDK's `ClientContext` directly here —
     * `ActiveSession` itself has no public handle back to the connection
     * that created it, so `client.ts` builds this from the `ClientContext`
     * it already holds. */
    private readonly sendCancel: () => Promise<void>,
    private readonly opts: AcpSessionOptions,
  ) {}

  get sessionId(): string {
    return this.active.sessionId;
  }

  /** The `session/new` response's `_meta`, if the agent returned one. */
  get meta(): Record<string, unknown> | null | undefined {
    return this.active.meta;
  }

  /**
   * Sends a prompt and drains `session/update` notifications until the turn
   * stops. If the agent's message text carries an AC-013 secret-request
   * fence (component.ts), resolves it through the injected `SecretRouter`
   * and automatically sends the follow-up turn with the answer fence —
   * repeating until a turn's text carries no further secret-request. The
   * secret value itself never passes through this method's return value.
   */
  async promptAndDrain(text: string): Promise<PromptTurnResult> {
    let promptText = text;
    const allUpdates: SessionNotification[] = [];
    let secretRoundTrips = 0;
    const maxSecretRoundTrips = this.opts.maxSecretRoundTrips ?? DEFAULT_MAX_SECRET_ROUND_TRIPS;

    for (;;) {
      await this.active.prompt(promptText);
      let messageText = "";
      let response: PromptResponse | null = null;

      for (;;) {
        const message = await this.active.nextUpdate();
        if (message.kind === "stop") {
          response = message.response;
          break;
        }
        allUpdates.push(message.notification);
        this.writeUpdateToTranscript(message.notification);
        messageText += extractText(message.update);
      }

      const atCap = secretRoundTrips >= maxSecretRoundTrips;
      const secretAnswer =
        this.opts.secretRouter && !atCap ? await this.opts.secretRouter.handleAgentText(messageText) : null;
      if (!secretAnswer) {
        return { updates: allUpdates, response: response!, secretRoundTrips };
      }
      secretRoundTrips += 1;
      promptText = secretAnswer;
    }
  }

  /** AC-004 — `session/cancel`. Per the ACP schema this is a *notification*
   * (fire-and-forget: `AgentNotificationHandlersByMethod.session_cancel`),
   * not a request/response — there is nothing to await beyond delivery.
   * Whether the agent process actually stops in-flight work is up to that
   * agent's own handling; see the package README for the empirically-
   * confirmed finding that packages/stub-agent's real ACP wire behavior for
   * cancel (a no-op `onNotification`) differs from its own hand-rolled
   * request/response scenario in agent.ts. */
  async cancel(): Promise<void> {
    this.opts.transcript?.write({
      kind: "system",
      role: "user",
      data: { cancel: { sessionId: this.sessionId } },
    });
    await this.sendCancel();
  }

  private writeUpdateToTranscript(notification: SessionNotification): void {
    if (!this.opts.transcript) return;
    const update = notification.update as SessionUpdate & { sessionUpdate: string };
    const kind = classifySessionUpdate(update.sessionUpdate);
    this.opts.transcript.write({ kind, role: "agent", data: notification });
  }

  dispose(): void {
    this.active.dispose();
  }
}

function classifySessionUpdate(sessionUpdate: string): "message" | "thought" | "tool_call" | "system" {
  if (sessionUpdate === "agent_message_chunk" || sessionUpdate === "user_message_chunk") return "message";
  if (sessionUpdate === "agent_thought_chunk") return "thought";
  if (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") return "tool_call";
  return "system";
}

function extractText(update: SessionUpdate): string {
  const content = (update as { content?: { type?: string; text?: string } }).content;
  if (content?.type === "text" && typeof content.text === "string") return content.text;
  return "";
}
