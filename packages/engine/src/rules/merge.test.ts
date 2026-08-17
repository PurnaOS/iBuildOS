import { describe, expect, it } from "vitest";
import { checkMergeOrderedResource, checkMergeSuperseded } from "./merge.js";

describe("merge/superseded", () => {
  it("green: story not present on trunk yet", () => {
    expect(checkMergeSuperseded("ST-0042", undefined, undefined)).toEqual([]);
  });

  it("green: story on trunk but not done, no conflicting claim", () => {
    const findings = checkMergeSuperseded("ST-0042", { state: "building" }, undefined);
    expect(findings).toEqual([]);
  });

  it("red: story already done on trunk", () => {
    const findings = checkMergeSuperseded("ST-0042", { state: "done" }, undefined, "merge");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "merge/superseded", severity: "error", artifact: "ST-0042" });
  });

  it("default severity (no context) is warn, not error", () => {
    const findings = checkMergeSuperseded("ST-0042", { state: "done" }, undefined);
    expect(findings[0]!.severity).toBe("warn");
  });

  it("red: trunk claim from a different machine, written after this stream's own claim", () => {
    const findings = checkMergeSuperseded(
      "ST-0042",
      {
        state: "building",
        claim: { by: "US-0002", machine: "other-machine", at: "2026-08-14T10:00:00Z" },
      },
      { by: "US-0001", machine: "my-machine", at: "2026-08-14T09:00:00Z" },
      "merge",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subject).toBe("claim");
  });

  it("green: trunk claim from the same machine as this stream's own claim", () => {
    const findings = checkMergeSuperseded(
      "ST-0042",
      {
        state: "building",
        claim: { by: "US-0001", machine: "my-machine", at: "2026-08-14T10:00:00Z" },
      },
      { by: "US-0001", machine: "my-machine", at: "2026-08-14T09:00:00Z" },
    );
    expect(findings).toEqual([]);
  });

  it("green: trunk claim predates this stream's own claim (stale/racing read, not a real supersession)", () => {
    const findings = checkMergeSuperseded(
      "ST-0042",
      {
        state: "building",
        claim: { by: "US-0002", machine: "other-machine", at: "2026-08-14T08:00:00Z" },
      },
      { by: "US-0001", machine: "my-machine", at: "2026-08-14T09:00:00Z" },
    );
    expect(findings).toEqual([]);
  });
});

describe("merge/ordered-resource", () => {
  it("green: no other in-flight stream", () => {
    const findings = checkMergeOrderedResource("ST-0042/a3f9", [{ component: "api", name: "migrate" }], []);
    expect(findings).toEqual([]);
  });

  it("green: in-flight streams touch different resources", () => {
    const findings = checkMergeOrderedResource(
      "ST-0042/a3f9",
      [{ component: "api", name: "migrate" }],
      [{ streamId: "ST-0099/bbbb", resources: [{ component: "api", name: "seed" }] }],
    );
    expect(findings).toEqual([]);
  });

  it("red: another in-flight stream touches the same resource", () => {
    const findings = checkMergeOrderedResource(
      "ST-0042/a3f9",
      [{ component: "api", name: "migrate" }],
      [{ streamId: "ST-0099/bbbb", resources: [{ component: "api", name: "migrate" }] }],
      "merge",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "merge/ordered-resource", severity: "error", artifact: "ST-0042/a3f9" });
  });

  it("excludes the stream itself from the in-flight comparison", () => {
    const findings = checkMergeOrderedResource(
      "ST-0042/a3f9",
      [{ component: "api", name: "migrate" }],
      [{ streamId: "ST-0042/a3f9", resources: [{ component: "api", name: "migrate" }] }],
    );
    expect(findings).toEqual([]);
  });
});
