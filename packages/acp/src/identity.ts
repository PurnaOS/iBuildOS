// FORMATS.md §10 — agent identity string: "<agent>/<adapter>@<version>",
// e.g. "claude-code/claude-agent-acp@0.66.0". Used in `generated.by`, Run
// records (BD-011/AC-012), and commit trailers.

export interface AgentIdentity {
  agent: string;
  adapter: string;
  version: string;
}

const IDENTITY_PATTERN = /^([^/\s]+)\/([^@\s]+)@(\S+)$/;

export function formatAgentIdentity(id: AgentIdentity): string {
  return `${id.agent}/${id.adapter}@${id.version}`;
}

export function parseAgentIdentity(value: string): AgentIdentity {
  const match = IDENTITY_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `invalid agent identity string "${value}" — expected "<agent>/<adapter>@<version>" (FORMATS.md §10)`,
    );
  }
  const [, agent, adapter, version] = match;
  return { agent: agent!, adapter: adapter!, version: version! };
}

/** Machine-local transcript URI (FORMATS.md §9): `ibos-transcript://<project-ulid>/<RN-id>.jsonl`. */
export function transcriptUri(projectId: string, runId: string): string {
  return `ibos-transcript://${projectId}/${runId}.jsonl`;
}
