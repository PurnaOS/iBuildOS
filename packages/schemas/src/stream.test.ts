import { describe, expect, it } from "vitest";
import { STREAM_NONCE_PATTERN, StreamSchema } from "./stream.js";

describe("StreamSchema", () => {
  it("parses a well-formed stream", () => {
    const stream = {
      nonce: "a3f9",
      branch: "ibos/st-0042-a3f9",
      worktreePath: "/tmp/ibuildos/worktrees/st-0042-a3f9",
      assignment: ["ST-0042"],
      status: "running",
      stage: "implement",
      createdAt: "2026-08-14T09:15:00Z",
      updatedAt: "2026-08-14T09:20:00Z",
    };
    expect(StreamSchema.parse(stream)).toMatchObject(stream);
  });

  it("rejects an empty assignment", () => {
    expect(() =>
      StreamSchema.parse({
        nonce: "a3f9",
        branch: "ibos/st-0042-a3f9",
        worktreePath: "/tmp/x",
        assignment: [],
        status: "queued",
        createdAt: "2026-08-14T09:15:00Z",
        updatedAt: "2026-08-14T09:15:00Z",
      }),
    ).toThrow();
  });

  it("rejects an unknown status", () => {
    expect(() =>
      StreamSchema.parse({
        nonce: "a3f9",
        branch: "ibos/st-0042-a3f9",
        worktreePath: "/tmp/x",
        assignment: ["ST-0042"],
        status: "vibing",
        createdAt: "2026-08-14T09:15:00Z",
        updatedAt: "2026-08-14T09:15:00Z",
      }),
    ).toThrow();
  });

  it("nonce pattern matches FORMATS §11's 4-char base36 convention", () => {
    expect(STREAM_NONCE_PATTERN.test("a3f9")).toBe(true);
    expect(STREAM_NONCE_PATTERN.test("A3F9")).toBe(false); // canonical lowercase
    expect(STREAM_NONCE_PATTERN.test("a3f")).toBe(false); // too short
  });
});
