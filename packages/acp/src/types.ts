// The SDK re-exports every wire type at its top level (`acp.d.ts`:
// `export type * from "./schema/types.gen.js"`) rather than under a
// `schema` namespace, and publishes no `/schema` type subpath — verified
// against the installed 1.3.0 package, not assumed from docs.
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

// Shared types for the ACP client layer (TECH-STACK.md T-005, SPEC.md area AC).

/**
 * Returns the absolute path of the worktree a session's fs/terminal services
 * should be scoped to (AC-007/BD-003). Injected by the caller — the stream/
 * worktree lifecycle lives in a sibling package (packages/engine's scheduler)
 * that this package must not import (task boundary). In production this
 * resolves a stream's real worktree path; in tests it's a temp dir.
 */
export type WorktreePathResolver = () => string;

/** AC-006: a policy decision for one `session/request_permission` call.
 * `ask` means "escalate to a human" — this package does not implement the
 * full autonomy-dial/attention-queue UI (out of scope per the task), so an
 * `ask` decision resolves via an optional injected `escalate` callback, or
 * safely as `RequestPermissionOutcome: cancelled` if none is supplied. */
export type PermissionDecision = "allow" | "deny" | "ask";

/** Simple injected policy function (task requirement 6): decide from the
 * raw ACP request alone. Real autonomy-dial semantics (BD-004) are a later
 * layer that can wrap this function; this package only needs the seam. */
export type PermissionPolicy = (
  request: RequestPermissionRequest,
) => PermissionDecision;

/** Resolves an `ask` decision to a chosen permission option id, or `null` to
 * cancel the request. Optional — if omitted, `ask` always cancels. */
export type PermissionEscalation = (
  request: RequestPermissionRequest,
) => Promise<string | null> | string | null;

/** AC-013 secret routing seam — re-exported shape from packages/engine so
 * this package never imports engine directly (task boundary: inject, don't
 * import the sibling work). Structurally identical to
 * packages/engine/src/secrets/secret-store.ts's `SecretStore`. */
export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  request(name: string, reason?: string): Promise<string>;
}

/** A clock/timer seam so backoff logic (BD-016) is testable without real
 * sleeps. `wait` resolves after `ms` in production (real setTimeout); tests
 * inject an instant/no-op version and assert on the *computed* delays
 * instead of actually waiting. */
export interface Clock {
  now(): number;
  wait(ms: number): Promise<void>;
  /** Defaults to Math.random; injectable so jittered delays are assertable. */
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

/** One line of raw JSON-RPC traffic observed on an agent connection, tapped
 * before the ACP SDK's schema validation runs — see spawn.ts. Used so the
 * transcript never silently loses content an adapter sends in a shape the
 * SDK's strict zod schemas reject (empirically confirmed against
 * packages/stub-agent — see README/decision notes). */
export interface RawFrame {
  direction: "in" | "out";
  at: number; // epoch ms
  json: unknown;
}
