import { describe, expect, it } from "vitest";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { readFixture } from "../test-utils/fixtures.js";
import {
  checkBugRegression,
  checkCodeUnlinked,
  checkDoneHonest,
  checkReqUnimplemented,
  checkStoryUntested,
  checkTaskNoCode,
  checkTodoMarker,
  matchGlob,
} from "./chain.js";

function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("graph/profile/work-item.md"),
    readFixture("graph/profile/requirement.md"),
    readFixture("graph/profile/story.md"),
    readFixture("graph/profile/task.md"),
    readFixture("graph/profile/test-case.md"),
  ]);
}

function loadArtifact(path: string): GraphArtifact {
  const { frontmatter } = parseOkfDocument(readFixture(path));
  return { id: frontmatter.id as string, type: frontmatter.type as string, frontmatter };
}

describe("matchGlob", () => {
  it("matches a single-star glob against a same-directory file", () => {
    expect(matchGlob("src/*.ts", "src/foo.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/nested/foo.ts")).toBe(false);
  });

  it("a double-star glob matches nested directories and zero directories", () => {
    expect(matchGlob("src/**/*.ts", "src/foo.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "src/a/b/foo.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "lib/foo.ts")).toBe(false);
  });
});

describe("chain/req-unimplemented", () => {
  it("green: a ready Requirement with an implementing Story", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Requirement");
    const graph = new ArtifactGraph([
      loadArtifact("graph/req-unimplemented/green/rq-0001.md"),
      loadArtifact("graph/req-unimplemented/green/st-0001.md"),
    ]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/req-unimplemented/green/rq-0001.md"));
    expect(checkReqUnimplemented("RQ-0001", frontmatter, type, graph, registry)).toEqual([]);
  });

  it("red: a ready Requirement with no implementing Story", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Requirement");
    const graph = new ArtifactGraph([loadArtifact("graph/req-unimplemented/red/rq-0001.md")]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/req-unimplemented/red/rq-0001.md"));
    expect(checkReqUnimplemented("RQ-0001", frontmatter, type, graph, registry)).toEqual([
      expect.objectContaining({
        rule: "chain/req-unimplemented",
        severity: "warn",
        artifact: "RQ-0001",
        subject: "implements",
      }),
    ]);
  });

  it("a draft Requirement (below 'ready') is not flagged even with no Story", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Requirement");
    const graph = new ArtifactGraph([{ id: "RQ-0001", type: "Requirement", frontmatter: { state: "draft" } }]);
    expect(
      checkReqUnimplemented("RQ-0001", { state: "draft" }, type, graph, registry),
    ).toEqual([]);
  });
});

describe("chain/story-untested", () => {
  const registry = buildRegistry();
  const type = registry.resolve("Story");

  it("flags a Story with no verified_by links at all", () => {
    const graph = new ArtifactGraph([{ id: "ST-0001", type: "Story", frontmatter: {} }]);
    expect(checkStoryUntested("ST-0001", {}, type, graph, registry)).toEqual([
      expect.objectContaining({ rule: "chain/story-untested", subject: "verified_by" }),
    ]);
  });

  it("flags a Story whose linked TestCase has no passing TestResult", () => {
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { links: { verified_by: ["TC-0001"] } } },
      { id: "TC-0001", type: "TestCase", frontmatter: {} },
    ]);
    expect(
      checkStoryUntested("ST-0001", { links: { verified_by: ["TC-0001"] } }, type, graph, registry),
    ).toEqual([expect.objectContaining({ rule: "chain/story-untested" })]);
  });

  it("passes when a linked TestCase has a passing TestResult", () => {
    const testResultRegistry = ProfileRegistry.fromRawDocuments([
      readFixture("graph/profile/work-item.md"),
      readFixture("graph/profile/requirement.md"),
      readFixture("graph/profile/story.md"),
      readFixture("graph/profile/task.md"),
      readFixture("graph/profile/test-case.md"),
      `---
type: TypeDefinition
defines: TestResult
abstract: false
prefix: TR
fields: {}
links: {}
body: { sections: [] }
---
`,
    ]);
    const storyType = testResultRegistry.resolve("Story");
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { links: { verified_by: ["TC-0001"] } } },
      { id: "TC-0001", type: "TestCase", frontmatter: {} },
      { id: "TR-0001", type: "TestResult", frontmatter: { subject: "TC-0001", verdict: "pass" } },
    ]);
    expect(
      checkStoryUntested(
        "ST-0001",
        { links: { verified_by: ["TC-0001"] } },
        storyType,
        graph,
        testResultRegistry,
      ),
    ).toEqual([]);
  });

  it("no-ops for a type that doesn't declare a verified_by relationship", () => {
    const taskType = registry.resolve("Task");
    const graph = new ArtifactGraph([{ id: "TA-0001", type: "Task", frontmatter: {} }]);
    expect(checkStoryUntested("TA-0001", {}, taskType, graph, registry)).toEqual([]);
  });

  it("matches a lowercase TestResult.subject against an uppercase link target (FORMATS §2 case-insensitivity)", () => {
    const testResultRegistry = ProfileRegistry.fromRawDocuments([
      readFixture("graph/profile/work-item.md"),
      readFixture("graph/profile/requirement.md"),
      readFixture("graph/profile/story.md"),
      readFixture("graph/profile/task.md"),
      readFixture("graph/profile/test-case.md"),
      `---
type: TypeDefinition
defines: TestResult
abstract: false
prefix: TR
fields: {}
links: {}
body: { sections: [] }
---
`,
    ]);
    const storyType = testResultRegistry.resolve("Story");
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { links: { verified_by: ["TC-0001"] } } },
      { id: "TC-0001", type: "TestCase", frontmatter: {} },
      { id: "TR-0001", type: "TestResult", frontmatter: { subject: "tc-0001", verdict: "pass" } },
    ]);
    expect(
      checkStoryUntested(
        "ST-0001",
        { links: { verified_by: ["TC-0001"] } },
        storyType,
        graph,
        testResultRegistry,
      ),
    ).toEqual([]);
  });

  it("respects a gate context override: warn by default, error under 'merge'", () => {
    const graph = new ArtifactGraph([{ id: "ST-0001", type: "Story", frontmatter: {} }]);
    expect(checkStoryUntested("ST-0001", {}, type, graph, registry)[0]?.severity).toBe("warn");
    expect(checkStoryUntested("ST-0001", {}, type, graph, registry, "merge")[0]?.severity).toBe(
      "error",
    );
  });
});

describe("chain/task-no-code", () => {
  it("green: the done Task's code glob matches a file in scope", () => {
    const { frontmatter } = parseOkfDocument(readFixture("graph/task-no-code/green/ta-0001.md"));
    expect(checkTaskNoCode("TA-0001", frontmatter, ["src/real/foo.ts"])).toEqual([]);
  });

  it("red: the done Task's code glob matches nothing in scope", () => {
    const { frontmatter } = parseOkfDocument(readFixture("graph/task-no-code/red/ta-0001.md"));
    expect(checkTaskNoCode("TA-0001", frontmatter, ["src/real/foo.ts"])).toEqual([
      expect.objectContaining({
        rule: "chain/task-no-code",
        severity: "error",
        artifact: "TA-0001",
        subject: "src/missing/**/*.ts",
      }),
    ]);
  });

  it("no-ops for a Task that isn't done", () => {
    expect(
      checkTaskNoCode("TA-0001", { state: "building", code: ["src/missing/**"] }, []),
    ).toEqual([]);
  });
});

describe("chain/code-unlinked", () => {
  it("flags a file no Task's code glob references", () => {
    const tasks = [{ frontmatter: { code: ["src/real/**/*.ts"] } }];
    expect(checkCodeUnlinked(tasks, ["src/real/foo.ts", "src/orphan.ts"])).toEqual([
      expect.objectContaining({ rule: "chain/code-unlinked", severity: "info", artifact: "src/orphan.ts" }),
    ]);
  });

  it("passes when every file is referenced by some Task", () => {
    const tasks = [{ frontmatter: { code: ["src/**/*.ts"] } }];
    expect(checkCodeUnlinked(tasks, ["src/a.ts", "src/b.ts"])).toEqual([]);
  });
});

describe("chain/done-honest", () => {
  it("composes task-no-code + story-untested + link-target-exists under its own rule id", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Task");
    const graph = new ArtifactGraph([{ id: "TA-0001", type: "Task", frontmatter: {} }]);
    const frontmatter = { state: "done", code: ["src/missing/**"] };
    const findings = checkDoneHonest("TA-0001", frontmatter, type, graph, registry, ["src/real.ts"]);
    expect(findings).toEqual([
      expect.objectContaining({ rule: "chain/done-honest", severity: "error", subject: "src/missing/**" }),
    ]);
  });

  it("no-ops for an artifact that isn't done", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Task");
    const graph = new ArtifactGraph([{ id: "TA-0001", type: "Task", frontmatter: {} }]);
    expect(
      checkDoneHonest("TA-0001", { state: "building" }, type, graph, registry, []),
    ).toEqual([]);
  });
});

describe("chain/bug-regression", () => {
  it("passes when a TestCase verifies this Bug", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      { id: "BG-0001", type: "Bug", frontmatter: {} },
      { id: "TC-0001", type: "TestCase", frontmatter: { links: { verifies: ["BG-0001"] } } },
    ]);
    expect(checkBugRegression("BG-0001", graph, registry)).toEqual([]);
  });

  it("flags a Bug with no verifies-Bug TestCase", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([{ id: "BG-0001", type: "Bug", frontmatter: {} }]);
    expect(checkBugRegression("BG-0001", graph, registry)).toEqual([
      expect.objectContaining({
        rule: "chain/bug-regression",
        severity: "warn",
        artifact: "BG-0001",
        subject: "verifies",
      }),
    ]);
  });

  it("respects a gate context override: warn by default, error under 'merge'", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([{ id: "BG-0001", type: "Bug", frontmatter: {} }]);
    expect(checkBugRegression("BG-0001", graph, registry)[0]?.severity).toBe("warn");
    expect(checkBugRegression("BG-0001", graph, registry, "merge")[0]?.severity).toBe("error");
  });
});

describe("docs/todo-marker", () => {
  it("flags each TODO(ibos) marker in the body", () => {
    const body = "Some prose.\nTODO(ibos) fix this later\nMore prose.\nTODO(ibos) and this too";
    const findings = checkTodoMarker("ST-0001", body);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual(
      expect.objectContaining({ rule: "docs/todo-marker", severity: "warn", artifact: "ST-0001" }),
    );
  });

  it("passes when there are no markers", () => {
    expect(checkTodoMarker("ST-0001", "nothing to see here")).toEqual([]);
  });
});
