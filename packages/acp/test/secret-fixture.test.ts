import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpClient, spawnCommandAgent } from "../src/client.js";
import { TranscriptWriter } from "../src/transcript.js";
import { fixturePath, FakeSecretStore, makeTempDir, waitFor } from "./helpers.js";

// AC-013 — a secret-request event surfaces, routes through the injected
// SecretStore, and the value never appears in the written transcript file.
// Drives test/fixtures/secret-agent.mjs (see its doc comment / this
// package's README for why: no committed stub-agent scenario emits this
// signal).

const SECRET_VALUE = "sk_test_51ThisIsASecretValueThatMustNeverLeak";

describe("secret-request routing (AC-013)", () => {
  let client: AcpClient | null = null;

  afterEach(() => {
    client?.close();
    client = null;
  });

  it("resolves through the SecretStore and the stream resumes with the answer, never the value", async () => {
    const worktree = makeTempDir("secret-flow");
    const transcriptPath = join(worktree, "transcript.jsonl");
    const transcript = new TranscriptWriter(transcriptPath);
    const secretStore = new FakeSecretStore({ STRIPE_TEST_KEY: SECRET_VALUE });

    client = spawnCommandAgent(process.execPath, [fixturePath("secret-agent.mjs")], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "deny",
      secretStore,
      transcript,
    });

    await client.initialize();
    const session = await client.newSession(worktree);
    const { response, secretRoundTrips } = await session.promptAndDrain("go");

    expect(response.stopReason).toBe("end_turn");
    // One automatic round-trip: request fence -> SecretStore -> answer fence.
    expect(secretRoundTrips).toBe(1);

    // Read the transcript file back from disk and assert on its actual
    // bytes — not on in-memory state — per AC-012/AC-013's requirement that
    // the *persisted* transcript never carries the value.
    await waitFor(() => existsSync(transcriptPath) && readFileSync(transcriptPath, "utf8").includes('"answer"'));
    const raw = readFileSync(transcriptPath, "utf8");
    expect(raw).not.toContain(SECRET_VALUE);

    const events = raw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { kind: string; role: string; data: unknown });

    const secretRequestEvent = events.find(
      (e) => e.kind === "component" && (e.data as { kind?: string }).kind === "secret-request",
    );
    expect(secretRequestEvent).toBeDefined();
    expect(secretRequestEvent?.data).toEqual({
      kind: "secret-request",
      cid: "secret-1",
      name: "STRIPE_TEST_KEY",
      reason: "need it to call the billing sandbox",
    });

    const answerEvent = events.find((e) => e.kind === "answer");
    expect(answerEvent).toBeDefined();
    expect(answerEvent?.data).toEqual({ granted: true, env: "STRIPE_TEST_KEY" });
  });

  it("registers the value for redaction before any later event that might echo it", async () => {
    const worktree = makeTempDir("secret-redact");
    const transcriptPath = join(worktree, "transcript.jsonl");
    const transcript = new TranscriptWriter(transcriptPath);
    const secretStore = new FakeSecretStore({ STRIPE_TEST_KEY: SECRET_VALUE });

    client = spawnCommandAgent(process.execPath, [fixturePath("secret-agent.mjs")], worktree, {
      worktree: () => worktree,
      permissionPolicy: () => "deny",
      secretStore,
      transcript,
    });

    await client.initialize();
    const session = await client.newSession(worktree);
    await session.promptAndDrain("go");

    // Simulate a later, unrelated write that (by some future bug elsewhere)
    // includes the raw value — the writer must still redact it, because the
    // secret router registered it for redaction the moment it was granted.
    transcript.write({ kind: "system", role: "user", data: { note: `leaked: ${SECRET_VALUE}` } });

    await waitFor(() => existsSync(transcriptPath));
    const raw = readFileSync(transcriptPath, "utf8");
    expect(raw).not.toContain(SECRET_VALUE);
    expect(raw).toContain("[REDACTED]");
  });
});
