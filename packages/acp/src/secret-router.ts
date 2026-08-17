import type { SecretGrant } from "@ibuildos/schemas";
import { encodeSecretGrantAnswer, parseFences, type ParsedSecretRequestFence } from "./component.js";
import type { TranscriptWriter } from "./transcript.js";
import type { SecretStore } from "./types.js";

// AC-013 — an agent's declared need for a named credential surfaces as a
// secret-request event, distinct from decision cards: routed through the
// injected SecretStore (never through chat/cards/prompt turns), and the
// value must never appear in a transcript event this package writes.

export interface SecretRequestEvent {
  cid: string;
  name: string;
  reason?: string;
}

export interface SecretRouterOptions {
  secretStore: SecretStore;
  transcript?: TranscriptWriter;
  /** Fires with the resolved value once granted — e.g. to inject it into a
   * terminal's env for a subsequent tool call. This router never logs or
   * writes the value anywhere itself; callers of this hook must not either. */
  onGranted?: (event: SecretRequestEvent, value: string) => void;
}

export class SecretRouter {
  constructor(private readonly opts: SecretRouterOptions) {}

  /** Scans an agent message's text for a `ibuildos:secret-request` fence
   * (component.ts). If present: records a value-free "a secret was
   * requested" transcript event, resolves it through the SecretStore,
   * registers the resolved value for transcript redaction *before* writing
   * anything else, and returns the `ibuildos:answer` fence text to send
   * back as the next prompt's content (FORMATS §10's documented answer
   * shape: `{granted, env}`, never the value). Returns `null` if no
   * secret-request fence was present. */
  async handleAgentText(text: string): Promise<string | null> {
    const found = parseFences(text).find(
      (f): f is ParsedSecretRequestFence => f.kind === "secret-request",
    );
    if (!found) return null;

    const { cid, name, reason } = found.request;
    this.opts.transcript?.write({
      kind: "component",
      role: "agent",
      data: { kind: "secret-request", cid, name, reason },
    });

    let granted = true;
    let value = "";
    try {
      value = await this.opts.secretStore.request(name, reason);
    } catch {
      granted = false;
    }

    if (granted) {
      // Redaction registered before any further write — including this
      // router's own answer event below, in case a future edit to that
      // event ever starts carrying more context.
      this.opts.transcript?.addRedaction(value);
      this.opts.onGranted?.({ cid, name, ...(reason !== undefined ? { reason } : {}) }, value);
    }

    const grant: SecretGrant = { granted, env: name };
    this.opts.transcript?.write({ kind: "answer", role: "user", data: grant });

    return encodeSecretGrantAnswer(cid, grant);
  }
}
