import { describe, expect, it } from "vitest";
import { runCli } from "../run.js";
import { fixturePath } from "../test-utils/fixtures.js";

describe("ibuildos graph export", () => {
  it("exports nodes and edges as JSON", async () => {
    const result = await runCli(["graph", "export"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    const { nodes, edges } = JSON.parse(result.stdout) as {
      nodes: Array<{ id: string; type: string }>;
      edges: Array<{ from: string; relationship: string; targetId: string }>;
    };
    expect(nodes.map((n) => n.id)).toContain("ST-0042");
    expect(edges).toContainEqual({ from: "ST-0042", relationship: "implements", targetId: "RQ-0007" });
  });
});

describe("ibuildos graph matrix", () => {
  it("as JSON: a flat artifact/relationship/target edge list", async () => {
    const result = await runCli(["graph", "matrix"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    const rows = JSON.parse(result.stdout) as Array<{ artifact: string; relationship: string; target: string }>;
    expect(rows).toContainEqual({ artifact: "ST-0042", relationship: "verified_by", target: "TC-0031" });
  });

  it("as CSV: a header row plus one row per edge", async () => {
    const result = await runCli(["graph", "matrix", "--format", "csv"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines[0]).toBe("artifact,relationship,target");
    expect(lines).toContain("ST-0042,implements,RQ-0007");
  });
});
