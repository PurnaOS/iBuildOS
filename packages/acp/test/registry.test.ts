import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/registry.js";

describe("AgentRegistry (AC-002)", () => {
  it("seeds the three tier-1 agents named in TECH-STACK.md T-005", () => {
    const registry = new AgentRegistry();
    const ids = registry.list().map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["claude-code", "codex", "pi"]));
    for (const id of ["claude-code", "codex", "pi"]) {
      expect(registry.get(id)?.tier).toBe("tier-1");
    }
  });

  it("adds a custom agent without needing a code change", () => {
    const registry = new AgentRegistry();
    registry.register({
      id: "my-custom-agent",
      name: "My Custom Agent",
      tier: "custom",
      adapter: "my-custom-acp",
      command: "/usr/local/bin/my-agent",
      args: ["--acp"],
    });
    expect(registry.get("my-custom-agent")?.tier).toBe("custom");
    expect(registry.list().length).toBeGreaterThan(3);
  });

  it("refuses to silently clobber an existing id", () => {
    const registry = new AgentRegistry();
    expect(() =>
      registry.register({
        id: "claude-code",
        name: "Impostor",
        tier: "custom",
        adapter: "x",
        command: "x",
        args: [],
      }),
    ).toThrow();
  });

  it("allows an explicit overwrite", () => {
    const registry = new AgentRegistry();
    registry.register(
      { id: "claude-code", name: "Overridden", tier: "custom", adapter: "x", command: "x", args: [] },
      { overwrite: true },
    );
    expect(registry.get("claude-code")?.name).toBe("Overridden");
  });

  it("unregister removes an entry", () => {
    const registry = new AgentRegistry();
    expect(registry.unregister("pi")).toBe(true);
    expect(registry.get("pi")).toBeUndefined();
  });
});
