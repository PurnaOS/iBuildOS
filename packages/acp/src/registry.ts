// AC-002 — agent registry: built-in definitions for known ACP agents plus
// user-defined entries, addable without an app update. This module only
// carries launch-command *shape* (command/args/env) and identity metadata;
// it never spawns a process (see spawn.ts) and never assumes a specific
// adapter is actually installed — tier-1 agents are documented, pinned-
// version definitions per TECH-STACK.md T-005, not verified installs (that
// verification is the scheduled live matrix, T-013, out of this package's
// scope).

export type AgentTier = "tier-1" | "tier-2" | "custom";

export interface AgentDefinition {
  /** Registry key and the "<agent>" segment of the identity string (FORMATS §10). */
  id: string;
  name: string;
  tier: AgentTier;
  /** The "<adapter>" segment of the identity string (FORMATS §10). */
  adapter: string;
  /** Launch shape: argv[0]. */
  command: string;
  /** Launch shape: argv[1..]. */
  args: string[];
  env?: Record<string, string>;
  /** Static fallback version used only when the agent's `initialize`
   * response omits `agentInfo.version` — real sessions should prefer the
   * runtime-reported version (client.ts does this automatically). */
  fallbackVersion?: string;
  notes?: string;
}

// Tier-1 (TECH-STACK.md T-005): installed-by-default definitions, CI-covered
// for install/handshake/contract-shape against pinned adapter versions.
// Launch shapes below follow each adapter's documented npm-package
// convention (a `npx`-invoked bin) — this package does not require the
// adapter to actually be installed (task scope: registry entries, not
// working adapters).
const TIER_1: AgentDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    tier: "tier-1",
    adapter: "claude-agent-acp",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    notes: "Reference agent; session/load, permission modes (T-005).",
  },
  {
    id: "codex",
    name: "Codex CLI",
    tier: "tier-1",
    adapter: "codex-acp",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
    notes: "Second major vendor (T-005).",
  },
  {
    id: "pi",
    name: "pi",
    tier: "tier-1",
    adapter: "pi-acp",
    command: "npx",
    args: ["-y", "pi-acp"],
    notes: "Minimal open harness; community adapter, native ACP under upstream discussion (T-005).",
  },
];

// Tier-2: registry entries shipped, not in the CI test matrix (T-005).
const TIER_2: AgentDefinition[] = [
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    tier: "tier-2",
    adapter: "gemini-cli-native",
    command: "gemini",
    args: ["--acp"],
    notes: "Native ACP mode.",
  },
  {
    id: "goose",
    name: "Goose",
    tier: "tier-2",
    adapter: "goose-acp",
    command: "goose",
    args: ["acp"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    tier: "tier-2",
    adapter: "opencode-acp",
    command: "opencode",
    args: ["acp"],
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    tier: "tier-2",
    adapter: "qwen-code-acp",
    command: "qwen",
    args: ["acp"],
  },
];

export class AgentRegistry {
  private readonly defs = new Map<string, AgentDefinition>();

  constructor(seed: AgentDefinition[] = [...TIER_1, ...TIER_2]) {
    for (const def of seed) this.defs.set(def.id, def);
  }

  list(): AgentDefinition[] {
    return [...this.defs.values()];
  }

  get(id: string): AgentDefinition | undefined {
    return this.defs.get(id);
  }

  /** AC-002: add a custom (or tier-2) agent without an app update. Refuses to
   * silently clobber an existing id unless `overwrite` is set — a registry
   * collision is more likely a config mistake than intent. */
  register(def: AgentDefinition, opts: { overwrite?: boolean } = {}): void {
    if (this.defs.has(def.id) && !opts.overwrite) {
      throw new Error(
        `AgentRegistry: an agent with id "${def.id}" is already registered (pass { overwrite: true } to replace it)`,
      );
    }
    this.defs.set(def.id, def);
  }

  unregister(id: string): boolean {
    return this.defs.delete(id);
  }
}
