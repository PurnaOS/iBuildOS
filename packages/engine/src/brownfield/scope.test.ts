import { describe, expect, it } from "vitest";
import type { Finding } from "@ibuildos/schemas";
import { isPathInScope, partitionByScope, partitionFindingsByScope } from "./scope.js";

function finding(artifact: string, rule = "chain/code-unlinked"): Finding {
  return {
    rule,
    severity: "info",
    artifact,
    subject: "code",
    message: `fixture finding for ${artifact}`,
  };
}

describe("isPathInScope", () => {
  it("matches a single-glob scope", () => {
    expect(isPathInScope("src/legacy/foo.ts", ["src/legacy/**"])).toBe(true);
  });

  it("does not match a path outside every declared glob", () => {
    expect(isPathInScope("src/new/foo.ts", ["src/legacy/**"])).toBe(false);
  });

  it("matches when any of several globs matches (not just the first)", () => {
    expect(isPathInScope("docs/requirements/rq-0001.md", ["src/**", "docs/requirements/**"])).toBe(
      true,
    );
  });
});

describe("partitionByScope", () => {
  const scopeGlobs = ["src/legacy/**", "docs/requirements/**"];
  const items = [
    "src/legacy/foo.ts", // matches src/legacy/**
    "src/legacy/nested/bar.ts", // matches src/legacy/** (via **)
    "docs/requirements/rq-0001.md", // matches docs/requirements/**
    "src/new/baz.ts", // matches nothing
    "README.md", // matches nothing
  ];

  it("partitions items by declared path globs", () => {
    const { inScope, outOfScope } = partitionByScope(items, scopeGlobs, (p) => p);

    expect(inScope).toEqual([
      "src/legacy/foo.ts",
      "src/legacy/nested/bar.ts",
      "docs/requirements/rq-0001.md",
    ]);
    expect(outOfScope).toEqual(["src/new/baz.ts", "README.md"]);
  });

  it("edge case: a path matching multiple globs lands in inScope exactly once", () => {
    // "src/legacy/**" and a second, overlapping glob both match the same file.
    const overlapping = ["src/legacy/**", "src/legacy/foo.ts"];
    const { inScope, outOfScope } = partitionByScope(["src/legacy/foo.ts"], overlapping, (p) => p);

    expect(inScope).toEqual(["src/legacy/foo.ts"]);
    expect(outOfScope).toEqual([]);
  });

  it("edge case: a path matching no glob lands in outOfScope, not dropped", () => {
    const { inScope, outOfScope } = partitionByScope(["totally/unrelated.ts"], scopeGlobs, (p) => p);

    expect(inScope).toEqual([]);
    expect(outOfScope).toEqual(["totally/unrelated.ts"]);
  });

  it("an empty scope list sends everything out of scope (opt-in, not opt-out)", () => {
    const { inScope, outOfScope } = partitionByScope(items, [], (p) => p);

    expect(inScope).toEqual([]);
    expect(outOfScope).toEqual(items);
  });

  it("preserves relative order within each bucket", () => {
    const { inScope, outOfScope } = partitionByScope(items, scopeGlobs, (p) => p);

    expect(inScope).toEqual([...items].filter((p) => isPathInScope(p, scopeGlobs)));
    expect(outOfScope).toEqual([...items].filter((p) => !isPathInScope(p, scopeGlobs)));
  });
});

describe("partitionFindingsByScope", () => {
  it("defaults to treating Finding.artifact as the path (chain/code-unlinked's convention)", () => {
    const findings = [
      finding("src/legacy/foo.ts"),
      finding("src/new/bar.ts"),
      finding("docs/requirements/rq-0001.md"),
    ];

    const { inScope, outOfScope } = partitionFindingsByScope(findings, [
      "src/legacy/**",
      "docs/requirements/**",
    ]);

    expect(inScope.map((f) => f.artifact)).toEqual(["src/legacy/foo.ts", "docs/requirements/rq-0001.md"]);
    expect(outOfScope.map((f) => f.artifact)).toEqual(["src/new/bar.ts"]);
  });

  it("accepts a caller-supplied pathOf resolver for artifact-ID findings that need one", () => {
    const findings = [finding("ST-0001"), finding("ST-0099")];
    const pathByArtifact: Record<string, string> = {
      "ST-0001": "src/legacy/story-one.ts",
      "ST-0099": "src/new/story-ninety-nine.ts",
    };

    const { inScope, outOfScope } = partitionFindingsByScope(
      findings,
      ["src/legacy/**"],
      (f) => pathByArtifact[f.artifact] ?? "",
    );

    expect(inScope.map((f) => f.artifact)).toEqual(["ST-0001"]);
    expect(outOfScope.map((f) => f.artifact)).toEqual(["ST-0099"]);
  });
});
