import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpClient, spawnCommandAgent } from "../src/client.js";
import { TranscriptWriter } from "../src/transcript.js";
import { makeTempDir, PACKAGE_ROOT, STUB_AGENT_CLI, waitFor } from "./helpers.js";

// Drives the ONE stub-agent scenario actually present in this worktree's
// git history (`hello-world.json` — see the package README for why
// `permission-request.json`/`session-load.json` and the fuller agent.ts
// they need are not: `git log --all` finds no commit anywhere in this repo
// that added them). This is the real S-1 stub leg the scenario.ts comment
// says M3 owes: a literal child process, real stdio, the official SDK.

function spawnStubAgent(worktree: string, scenario: string, opts: Partial<Parameters<typeof spawnCommandAgent>[3]> = {}) {
  return spawnCommandAgent(
    process.execPath,
    ["--import", "tsx/esm", STUB_AGENT_CLI, scenario],
    // Spawn cwd is this package's root (where `tsx` resolves from), NOT the
    // worktree — those are independent parameters, see helpers.ts's
    // PACKAGE_ROOT doc comment.
    PACKAGE_ROOT,
    { worktree: () => worktree, permissionPolicy: () => "deny", ...opts },
  );
}

describe("stub-agent hello-world (S-1 stub leg)", () => {
  let client: AcpClient | null = null;

  afterEach(() => {
    client?.close();
    client = null;
  });

  it("AC-003: negotiates capabilities via a real initialize round-trip", async () => {
    const worktree = makeTempDir("hello-init");
    client = spawnStubAgent(worktree, "hello-world");

    const init = await client.initialize();
    expect(init.protocolVersion).toBe(1);
    expect(init.agentCapabilities?.loadSession).toBe(false);
    // Cached, not re-fetched.
    expect(client.negotiatedCapabilities).toEqual(init.agentCapabilities);
  });

  it(
    "documents the confirmed wire-format gap: session/prompt resolves normally but " +
      "zero session/update notifications reach the client, because stub-agent's " +
      '{"kind","data"} update shape fails the SDK\'s zSessionNotification validation ' +
      "(SessionUpdateRouter.handleMessage, @agentclientprotocol/sdk@1.3.0) — verified " +
      "empirically by driving this exact scenario through the real SDK, not assumed",
    async () => {
      const worktree = makeTempDir("hello-mismatch");
      const transcriptPath = join(worktree, "transcript.jsonl");
      const transcript = new TranscriptWriter(transcriptPath);
      client = spawnStubAgent(worktree, "hello-world", { transcript });

      await client.initialize();
      const session = await client.newSession(worktree);
      const { updates, response } = await session.promptAndDrain("hello");

      // The turn completes normally...
      expect(response.stopReason).toBe("end_turn");
      // ...but the SDK-validated update stream this package's session.ts
      // reads from delivered nothing. This is not a bug in session.ts — the
      // SDK itself silently drops the notification after a failed zod
      // parse (confirmed by reading @agentclientprotocol/sdk's compiled
      // `SessionUpdateRouter.handleMessage`, which calls
      // `validate.zSessionNotification.parse(message.params)`
      // unconditionally, with no fallback).
      expect(updates).toHaveLength(0);

      // The raw-frame tap (spawn.ts) is what makes the transcript
      // loss-proof against exactly this class of adapter incompatibility:
      // it classifies straight off the wire, independent of SDK
      // validation, so the agent's two message chunks are still recorded.
      await waitFor(() => {
        if (!existsSync(transcriptPath)) return false;
        return readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean).length >= 4;
      });
      const events = readFileSync(transcriptPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { kind: string; data: unknown });

      const messageEvents = events.filter((e) => e.kind === "message");
      expect(messageEvents.length).toBeGreaterThanOrEqual(2);

      const texts = messageEvents
        .map((e) => (e.data as { params?: { update?: { data?: { text?: string } } } }).params?.update?.data?.text)
        .join("");
      expect(texts).toBe("Hello, world.");
    },
  );

  it(
    "AC-004: documents a second confirmed interop gap — session/cancel is a fire-and-forget " +
      "notification per the real ACP schema, but stub-agent's agent.ts only checks its " +
      "cancelled flag inside the request/response handler for a literal session/cancel " +
      "*request*, so a real notification-shaped cancel silently no-ops against it",
    async () => {
      const worktree = makeTempDir("hello-cancel");
      client = spawnStubAgent(worktree, "hello-world");

      await client.initialize();
      const session = await client.newSession(worktree);

      const promptPromise = session.promptAndDrain("hello");
      // Sent before awaiting the prompt turn at all — if cancellation were
      // honored, this is about as favorable a timing as it gets.
      await session.cancel();
      const { response } = await promptPromise;

      // Confirmed, not assumed: this stays "end_turn", never "cancelled".
      expect(response.stopReason).toBe("end_turn");
    },
  );
});
