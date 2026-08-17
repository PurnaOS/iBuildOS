import * as acp from "@agentclientprotocol/sdk";
import type { AgentCapabilities, ClientConnection, InitializeResponse } from "@agentclientprotocol/sdk";
import { createFsService, type FsService } from "./fs-service.js";
import type { AgentIdentity } from "./identity.js";
import { toAcpMcpServers, type McpServerConfig } from "./mcp-passthrough.js";
import { PermissionBroker } from "./permission-broker.js";
import type { AgentDefinition } from "./registry.js";
import { SecretRouter } from "./secret-router.js";
import { AcpSession } from "./session.js";
import { spawnAgent, spawnCommand as spawnCommandProcess, type SpawnedAgent } from "./spawn.js";
import { createTerminalService, type TerminalService } from "./terminal-service.js";
import { TranscriptWriter } from "./transcript.js";
import type { PermissionEscalation, PermissionPolicy, SecretStore, WorktreePathResolver } from "./types.js";

// The top-level orchestrator: spawns an agent process, negotiates
// capabilities (AC-003), and creates sessions (AC-004) wired to the scoped
// fs/terminal services (AC-007), permission broker (AC-006), secret router
// (AC-013), and transcript writer (AC-012) — one `AcpClient` per spawned
// process, matching BD-001's "one process per stream".

export interface AcpClientOptions {
  worktree: WorktreePathResolver;
  permissionPolicy: PermissionPolicy;
  permissionEscalate?: PermissionEscalation;
  secretStore?: SecretStore;
  transcript?: TranscriptWriter;
  mcpServers?: McpServerConfig[];
  clientName?: string;
}

export class AcpClient {
  private conn: ClientConnection | null = null;
  private capabilities: AgentCapabilities | undefined;
  private agentInfoVersion: string | undefined;
  private readonly fs: FsService;
  private readonly terminal: TerminalService;
  private readonly permissionBroker: PermissionBroker;
  private readonly secretRouter: SecretRouter | undefined;

  constructor(
    private readonly spawned: SpawnedAgent,
    private readonly opts: AcpClientOptions,
  ) {
    this.fs = createFsService(opts.worktree);
    this.terminal = createTerminalService(opts.worktree);
    this.permissionBroker = new PermissionBroker(opts.permissionPolicy, opts.permissionEscalate);
    this.secretRouter = opts.secretStore
      ? new SecretRouter({
          secretStore: opts.secretStore,
          ...(opts.transcript ? { transcript: opts.transcript } : {}),
        })
      : undefined;

    // The loss-proof transcript path (spawn.ts's doc comment) — every raw
    // inbound frame, independent of whether the SDK's own schema validation
    // accepted it.
    if (opts.transcript) {
      const transcript = opts.transcript;
      spawned.onRawFrame((frame) => transcript.writeRawFrame(frame));
    }
  }

  /** AC-003 — `initialize` round-trip; the negotiated capabilities are
   * cached on this instance for the process's lifetime. */
  async initialize(): Promise<InitializeResponse> {
    const app = acp
      .client({ name: this.opts.clientName ?? "ibuildos" })
      .onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
        this.opts.transcript?.write({ kind: "permission", role: "agent", data: ctx.params });
        const { response, decision } = await this.permissionBroker.resolve(ctx.params);
        this.opts.transcript?.write({
          kind: "permission",
          role: "user",
          data: { decision, response },
        });
        return response;
      })
      .onRequest(acp.methods.client.fs.readTextFile, (ctx) => this.fs.readTextFile(ctx.params))
      .onRequest(acp.methods.client.fs.writeTextFile, (ctx) => this.fs.writeTextFile(ctx.params))
      .onRequest(acp.methods.client.terminal.create, (ctx) => this.terminal.create(ctx.params))
      .onRequest(acp.methods.client.terminal.output, (ctx) => this.terminal.output(ctx.params))
      .onRequest(acp.methods.client.terminal.release, (ctx) => this.terminal.release(ctx.params))
      .onRequest(acp.methods.client.terminal.waitForExit, (ctx) => this.terminal.waitForExit(ctx.params))
      .onRequest(acp.methods.client.terminal.kill, (ctx) => this.terminal.kill(ctx.params));

    this.conn = app.connect(this.spawned.stream);

    const response = await this.conn.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });
    this.capabilities = response.agentCapabilities;
    this.agentInfoVersion = response.agentInfo?.version;
    this.opts.transcript?.write({ kind: "system", role: "agent", data: { initialize: response } });
    return response;
  }

  /** AC-003 — cached negotiated capabilities; `undefined` until
   * `initialize()` resolves. */
  get negotiatedCapabilities(): AgentCapabilities | undefined {
    return this.capabilities;
  }

  /** AC-004/BD-001 — one session per stream/conversation. AC-009: project
   * (and, when the caller adds it, the bundled `ibuildos-ui`) MCP servers
   * pass through here, at `session/new`. */
  async newSession(cwd: string): Promise<AcpSession> {
    if (!this.conn) throw new Error("AcpClient.initialize() must resolve before newSession()");
    const builder = this.conn.agent.buildSession(cwd);
    for (const server of toAcpMcpServers(this.opts.mcpServers ?? [])) {
      builder.withMcpServer(server);
    }
    const active = await builder.start();
    return new AcpSession(active, {
      ...(this.opts.transcript ? { transcript: this.opts.transcript } : {}),
      ...(this.secretRouter ? { secretRouter: this.secretRouter } : {}),
    });
  }

  /** FORMATS §10 agent identity string, preferring the runtime-reported
   * `agentInfo.version` (available only after `initialize()`) over the
   * registry definition's static fallback. */
  identity(def: Pick<AgentDefinition, "id" | "adapter" | "fallbackVersion">): AgentIdentity {
    return {
      agent: def.id,
      adapter: def.adapter,
      version: this.agentInfoVersion ?? def.fallbackVersion ?? "unknown",
    };
  }

  close(): void {
    this.terminal.killAll();
    this.conn?.close();
    this.spawned.kill();
  }
}

/** Spawns a registered agent definition (AC-002) as this stream's process. */
export function spawnRegistryAgent(
  def: AgentDefinition,
  spawnCwd: string,
  opts: AcpClientOptions,
): AcpClient {
  return new AcpClient(spawnAgent(def, { cwd: spawnCwd }), opts);
}

/** Spawns an arbitrary command as an ACP agent process — the seam tests use
 * to drive `packages/stub-agent`'s CLI or this package's own fixture
 * agents, without going through the registry's launch-shape conventions. */
export function spawnCommandAgent(
  command: string,
  args: string[],
  spawnCwd: string,
  opts: AcpClientOptions,
): AcpClient {
  return new AcpClient(spawnCommandProcess(command, args, { cwd: spawnCwd }), opts);
}
