import { describe, expect, it } from "vitest";
import { buildRunFrontmatter } from "../src/run-record.js";

describe("buildRunFrontmatter (BD-011/AC-012, reuses RunFrontmatterSchema)", () => {
  it("builds a schema-valid Run frontmatter with the FORMATS §10 identity string", () => {
    const run = buildRunFrontmatter({
      id: "RN-0001",
      title: "Implement password reset — task 3",
      owner: "US-0001",
      state: "running",
      identity: { agent: "claude-code", adapter: "claude-agent-acp", version: "0.66.0" },
      role: "implementer",
      stream: "a3f9",
      subject: ["TA-0012"],
      started: "2026-08-16T10:00:00Z",
      projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });

    expect(run.agent).toBe("claude-code/claude-agent-acp@0.66.0");
    expect(run.transcript).toBe("ibos-transcript://01ARZ3NDEKTSV4RRFFQ69G5FAV/RN-0001.jsonl");
    expect(run.gates).toEqual({});
    expect(run.provenance).toBe("agent");
  });

  it("carries outcome and gate results through untouched", () => {
    const run = buildRunFrontmatter({
      id: "RN-0002",
      title: "Merge conflict resolution",
      owner: "US-0001",
      state: "done",
      identity: { agent: "codex", adapter: "codex-acp", version: "1.2.0" },
      subject: ["merge"],
      started: "2026-08-16T10:00:00Z",
      ended: "2026-08-16T10:05:00Z",
      outcome: "done",
      gates: { validate: "green", test: "green" },
      projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });

    expect(run.outcome).toBe("done");
    expect(run.gates).toEqual({ validate: "green", test: "green" });
  });

  it("rejects a malformed input (schema is the authority, not this builder)", () => {
    expect(() =>
      buildRunFrontmatter({
        id: "RN-0003",
        title: "x",
        owner: "not-a-valid-id",
        state: "running",
        identity: { agent: "codex", adapter: "codex-acp", version: "1.0.0" },
        subject: [],
        started: "not-an-iso-date",
        projectId: "p",
      }),
    ).toThrow();
  });
});
