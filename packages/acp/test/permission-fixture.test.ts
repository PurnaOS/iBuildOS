import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpClient, spawnCommandAgent } from "../src/client.js";
import { TranscriptWriter } from "../src/transcript.js";
import { fixturePath, makeTempDir, waitFor } from "./helpers.js";

// Drives this package's own fixture agent (test/fixtures/perm-agent.mjs),
// authored against the real SDK's `agent()` builder — see that file's doc
// comment for why: packages/stub-agent's `permission-request.json` scenario
// exists in no commit this worktree can reach. The fixture's
// `session/request_permission` call is schema-valid by construction (same
// SDK on both ends), so this test exercises the real wire shape.

describe("permission-request flow (AC-006)", () => {
  let client: AcpClient | null = null;

  afterEach(() => {
    client?.close();
    client = null;
  });

  it("auto-grants via an injected policy, and the agent's replay only continues after the answer", async () => {
    const worktree = makeTempDir("perm-allow");
    const transcriptPath = join(worktree, "transcript.jsonl");
    const transcript = new TranscriptWriter(transcriptPath);

    client = spawnCommandAgent(process.execPath, [fixturePath("perm-agent.mjs")], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "allow",
      transcript,
    });

    await client.initialize();
    const session = await client.newSession(worktree);
    const { updates, response } = await session.promptAndDrain("go");

    expect(response.stopReason).toBe("end_turn");
    // Both the "I'll need to run the test suite" chunk AND the
    // post-permission "Permission outcome: ..." chunk arrived — proving the
    // agent's scripted turn actually paused at the permission request and
    // only resumed once this client answered it (a serial dependency, not
    // a race — if the broker had never answered, `active.prompt()` would
    // still be pending and this test would hang instead of completing).
    const texts = updates
      .map((u) => (u.update as { content?: { text?: string } }).content?.text)
      .filter((t): t is string => typeof t === "string");
    expect(texts[0]).toContain("run the test suite");
    expect(texts[1]).toContain('"optionId":"allow"');

    await waitFor(() => {
      if (!existsSync(transcriptPath)) return false;
      const events = readFileSync(transcriptPath, "utf8").trim().split("\n").filter(Boolean);
      return events.some((l) => JSON.parse(l).kind === "permission");
    });
    const events = readFileSync(transcriptPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { kind: string; role: string; data: unknown });
    const permissionEvents = events.filter((e) => e.kind === "permission");
    expect(permissionEvents).toHaveLength(2); // the agent's request + our decision
    expect(permissionEvents[0]?.role).toBe("agent");
    expect(permissionEvents[1]?.role).toBe("user");
  });

  it("denies via an injected policy that always rejects", async () => {
    const worktree = makeTempDir("perm-deny");
    client = spawnCommandAgent(process.execPath, [fixturePath("perm-agent.mjs")], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "deny",
    });

    await client.initialize();
    const session = await client.newSession(worktree);
    const { updates } = await session.promptAndDrain("go");

    const texts = updates
      .map((u) => (u.update as { content?: { text?: string } }).content?.text)
      .filter((t): t is string => typeof t === "string");
    expect(texts[1]).toContain('"optionId":"reject"');
  });

  it("AC-009: passes configured MCP servers through at session/new", async () => {
    const worktree = makeTempDir("perm-mcp");
    client = spawnCommandAgent(process.execPath, [fixturePath("perm-agent.mjs")], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "allow",
      mcpServers: [
        { name: "ibuildos-ui", command: "/usr/local/bin/ibuildos-ui-mcp", args: ["--stdio"] },
        { name: "project-db", command: "/usr/local/bin/db-mcp", args: [], env: { READONLY: "1" } },
      ],
    });

    await client.initialize();
    // The fixture agent (test/fixtures/perm-agent.mjs) echoes the
    // `mcpServers` it received on `session/new` back via `_meta` — a real
    // wire round-trip proving the passthrough (mcp-passthrough.ts's
    // `toAcpMcpServers` feeding `SessionBuilder.withMcpServer`) actually
    // reaches the agent process, not just that our own shaping function
    // produces the right in-memory value.
    const session = await client.newSession(worktree);
    expect(session.meta?.mcpServersSeen).toEqual([
      { name: "ibuildos-ui", command: "/usr/local/bin/ibuildos-ui-mcp", args: ["--stdio"], env: [] },
      { name: "project-db", command: "/usr/local/bin/db-mcp", args: [], env: [{ name: "READONLY", value: "1" }] },
    ]);
  });
});
