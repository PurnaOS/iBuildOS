import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TranscriptEventSchema, type TranscriptEvent } from "@ibuildos/schemas";
import type { RawFrame } from "./types.js";

// FORMATS.md §9 — transcript JSONL: one machine-local, secret-redacted event
// per line, `{t, kind, role, data}` against `TranscriptEventSchema`. Never
// committed to the repo (AC-012) — callers point this at a gitignored
// project directory or a temp dir in tests, never at the repo bundle.

export interface TranscriptWriterOptions {
  /** Values that must never appear verbatim in a written event — secret
   * values, primarily (AC-013). Deep-scanned and replaced with
   * `[REDACTED]` in every event's `data` before the line is appended. */
  redact?: Iterable<string>;
}

export class TranscriptWriter {
  private readonly path: string;
  private readonly redactValues = new Set<string>();

  constructor(path: string, opts: TranscriptWriterOptions = {}) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    for (const v of opts.redact ?? []) this.addRedaction(v);
  }

  /** Registers a value (e.g. a freshly granted secret) that must be
   * redacted from every event written from this point on — and
   * retroactively cannot un-redact anything already flushed, by design. */
  addRedaction(value: string): void {
    if (value) this.redactValues.add(value);
  }

  write(event: Omit<TranscriptEvent, "t"> & { t?: string }): void {
    const stamped: TranscriptEvent = TranscriptEventSchema.parse({
      t: event.t ?? new Date().toISOString(),
      kind: event.kind,
      role: event.role,
      data: redactDeep(event.data, this.redactValues),
    });
    appendFileSync(this.path, JSON.stringify(stamped) + "\n", "utf8");
  }

  /** Writes a raw JSON-RPC frame captured by spawn.ts's tap, best-effort
   * classified into a TranscriptEventSchema kind. This is the loss-proof
   * path: it runs independently of whether the ACP SDK's own schema
   * validation accepted the frame (see spawn.ts's SpawnedAgent#onRawFrame
   * doc comment for why that matters against packages/stub-agent). */
  writeRawFrame(frame: RawFrame): void {
    const { kind, role } = classifyRawFrame(frame);
    this.write({ t: new Date(frame.at).toISOString(), kind, role, data: frame.json });
  }
}

function classifyRawFrame(frame: RawFrame): { kind: TranscriptEvent["kind"]; role: TranscriptEvent["role"] } {
  const role: TranscriptEvent["role"] = frame.direction === "in" ? "agent" : "user";
  const json = frame.json as { method?: string; params?: { update?: Record<string, unknown> } };
  const method = typeof json?.method === "string" ? json.method : undefined;

  if (method === "session/update") {
    const update = json.params?.update;
    const updateKind = classifyUpdateShape(update);
    return { kind: updateKind, role };
  }
  // Deliberately NOT special-casing "session/request_permission" here:
  // unlike `session/update` (routed through the SDK's unconditional
  // `SessionUpdateRouter`, where a schema mismatch silently drops the
  // notification), a malformed permission *request* fails its own
  // request/response validation visibly (a JSON-RPC error goes back to the
  // agent) — so there's no silent-loss risk to guard against, and
  // client.ts's `AcpClient.initialize()` already writes a semantically
  // richer "permission" event (the decision + response) for every request
  // its handler actually receives. Classifying it here too would double it.
  return { kind: "system", role };
}

/** Recognizes both the real ACP wire shape (`sessionUpdate` discriminant)
 * and packages/stub-agent's simplified shape (`kind` discriminant) — see
 * spawn.ts's doc comment on why raw frames may be in either shape. */
function classifyUpdateShape(update: Record<string, unknown> | undefined): TranscriptEvent["kind"] {
  if (!update) return "system";
  const real = update["sessionUpdate"];
  if (typeof real === "string") {
    if (real === "agent_message_chunk" || real === "user_message_chunk") return "message";
    if (real === "agent_thought_chunk") return "thought";
    if (real === "tool_call" || real === "tool_call_update") return "tool_call";
    return "system";
  }
  const legacy = update["kind"];
  if (typeof legacy === "string") {
    if (legacy === "message_chunk") return "message";
    if (legacy === "thought_chunk") return "thought";
    if (legacy === "tool_call") return "tool_call";
    if (legacy === "permission_request") return "permission";
    return "system";
  }
  return "system";
}

function redactDeep(value: unknown, redactValues: Set<string>): unknown {
  if (redactValues.size === 0) return value;
  if (typeof value === "string") {
    let out = value;
    for (const secret of redactValues) {
      if (secret && out.includes(secret)) out = out.split(secret).join("[REDACTED]");
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, redactValues));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, redactValues);
    return out;
  }
  return value;
}
