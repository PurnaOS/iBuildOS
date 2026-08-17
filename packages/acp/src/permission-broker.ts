import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { PermissionDecision, PermissionEscalation, PermissionPolicy } from "./types.js";

// AC-006 — maps `session/request_permission` to a policy decision:
// auto-grant for in-scope/declared-safe, else escalate. This module is
// deliberately not the full autonomy-dial system (BD-004) — it takes a
// plain injected `PermissionPolicy` function per the task's scope, and a
// dial/UI layer can wrap it later without this module changing.

export class PermissionBroker {
  constructor(
    private readonly policy: PermissionPolicy,
    private readonly escalate?: PermissionEscalation,
  ) {}

  async resolve(request: RequestPermissionRequest): Promise<{
    response: RequestPermissionResponse;
    decision: PermissionDecision;
  }> {
    const decision = this.policy(request);

    if (decision === "allow") {
      return { decision, response: outcomeFor(pickOption(request.options, "allow")) };
    }
    if (decision === "deny") {
      return { decision, response: outcomeFor(pickOption(request.options, "reject")) };
    }

    // "ask": resolve via the injected escalation, or cancel — never
    // silently auto-approve an escalation just because no handler is wired.
    const optionId = this.escalate ? await this.escalate(request) : null;
    return { decision, response: outcomeFor(optionId ?? null) };
  }
}

function pickOption(options: PermissionOption[], prefer: "allow" | "reject"): string | null {
  const exact = options.find((o) => o.kind === `${prefer}_once`);
  if (exact) return exact.optionId;
  const anyKind = options.find((o) => o.kind.startsWith(prefer));
  return anyKind ? anyKind.optionId : null;
}

function outcomeFor(optionId: string | null): RequestPermissionResponse {
  if (optionId === null) return { outcome: { outcome: "cancelled" } };
  return { outcome: { outcome: "selected", optionId } };
}
