import type { EnvVariable, McpServer } from "@agentclientprotocol/sdk";

// AC-009 — project-configured MCP servers passed through to agent sessions
// at `session/new`, where the agent supports MCP configuration. Thin
// passthrough only: this module shapes config into the SDK's `McpServer`
// wire type, it does not run or proxy an MCP server itself. The bundled
// `ibuildos-ui` server (FORMATS §10 carrier A: `ui_emit_component`,
// `ui_request_secret`) is a *particular* entry a caller can add to this same
// list — this package doesn't implement that server (that's the bridge
// package's GU-012/S-2 concern per EXECUTION-PLAN.md M5), only the
// passthrough wiring any MCP server (bundled or project-configured) rides
// on.

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function toEnvVariables(env: Record<string, string> | undefined): EnvVariable[] {
  return Object.entries(env ?? {}).map(([name, value]) => ({ name, value }));
}

/** Converts iBuildOS's own MCP server config shape into the SDK's
 * `McpServer[]` for `SessionBuilder.withMcpServer` / `NewSessionRequest.mcpServers`.
 * Stdio is the only transport this package shapes for now — http/sse/acp
 * server configs, if the project ever declares one, pass through unchanged
 * since callers may also push a raw `McpServer` directly onto the array
 * this returns. */
export function toAcpMcpServers(configs: McpServerConfig[]): McpServer[] {
  return configs.map((c) => ({
    name: c.name,
    command: c.command,
    args: c.args ?? [],
    env: toEnvVariables(c.env),
  }));
}
