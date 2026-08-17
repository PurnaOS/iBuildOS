import { appendFile } from "node:fs/promises";

// SPEC TM-008 — outbound notification adapters. Attention-queue events
// (assignment, review/acceptance request, red gate, supersession, PR
// merged) are deliverable to external channels as per-user, per-project
// *opt-in* adapters "executed locally by the app" (TM-008) — no hosted
// service of ours (D-107).
//
// `packages/engine` has no network of its own (CLAUDE.md non-negotiable #3:
// the deterministic gate engine has no AI and no network — ever). The
// webhook adapter below therefore takes its HTTP transport as a *required*
// constructor argument instead of defaulting to `fetch` — the app supplies
// its own `fetch` (or a test double) at the call site, so this file
// contains a payload contract and zero network origination of its own.
// Local filesystem I/O (the file adapter below) isn't under that
// restriction — the engine already does direct fs I/O elsewhere (e.g.
// `watch/synthetic-repo.ts`).

/** One attention-queue event eligible for outbound delivery (TM-008). The
 * event taxonomy (`kind`) is free text, not hardcoded here — consistent
 * with the engine hardcoding no taxonomy (CLAUDE.md non-negotiable #4). */
export interface NotificationEvent {
  kind: string;
  artifactId: string;
  /** The `US-…` recipient this event is for. */
  recipient: string;
  message: string;
  /** ISO-8601 datetime. */
  at: string;
  /** Free-form event-specific detail (e.g. previous/next state). */
  detail?: Record<string, unknown>;
}

/** Outbound notification adapter (TM-008). */
export interface NotificationAdapter {
  send(event: NotificationEvent): Promise<void>;
}

/** Minimal HTTP transport shape an adapter needs — a subset of the DOM/Node
 * `fetch` signature, so `globalThis.fetch` satisfies it structurally at the
 * app layer. Deliberately never defaulted anywhere in this file — see the
 * file header for why. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface WebhookAdapterConfig {
  url: string;
  /** Required — see file header: this file never originates network I/O. */
  transport: FetchLike;
  headers?: Record<string, string>;
}

/** Generic webhook adapter (TM-008): POSTs the event as JSON. A
 * Slack/Teams-compatible webhook that expects a differently-shaped payload
 * can wrap this adapter (transform the event before calling `send`, or
 * supply a `transport` that reshapes the body first) — payload shaping per
 * channel is app-layer policy, not engine logic. */
export class WebhookNotificationAdapter implements NotificationAdapter {
  constructor(private readonly config: WebhookAdapterConfig) {}

  async send(event: NotificationEvent): Promise<void> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.config.headers,
    };
    const response = await this.config.transport(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(`webhook delivery failed: HTTP ${response.status}`);
    }
  }
}

export interface FileNotificationAdapterConfig {
  /** Path to append newline-delimited JSON events to. */
  path: string;
}

/** Stub "email" adapter (TM-008's optional extra channel): no SMTP client —
 * appends each event as one line of JSON to a local file, standing in for
 * an email outbox so the adapter contract is exercisable without a real
 * mail server. */
export class FileNotificationAdapter implements NotificationAdapter {
  constructor(private readonly config: FileNotificationAdapterConfig) {}

  async send(event: NotificationEvent): Promise<void> {
    await appendFile(this.config.path, `${JSON.stringify(event)}\n`, "utf8");
  }
}
