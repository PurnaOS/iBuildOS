import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { GatesFileSchema, resolveSeverity, type GatesFile } from "@ibuildos/schemas";
import { readFixture } from "../test-utils/fixtures.js";
import { checkCommittedSecret } from "../rules/security.js";
import {
  GateCompositionError,
  evaluateGate,
  expandGate,
  type RuleChecker,
} from "./evaluate.js";

function loadGatesFixture(name: string): GatesFile {
  return GatesFileSchema.parse(parseYaml(readFixture(`gates/${name}`)));
}

describe("expandGate — glob + composition expansion", () => {
  it("expands prefix/* globs against RULE_REGISTRY's known rule ids", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const ruleIds = expandGate("requirement-ready", gatesFile).map((r) => r.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "doc/field-required",
        "doc/field-kind",
        "doc/section-required",
        "doc/criteria-items",
        "doc/body-link",
        "id/format",
        "id/duplicate",
        "id/provisional-on-trunk",
        "link/target-exists",
        "link/target-type",
        "link/cardinality",
        "link/cycles",
        "state/vocabulary",
      ]),
    );
    // state/* was not requested by this gate — only the one explicit state rule.
    expect(ruleIds).not.toContain("state/legal");
  });

  it("recursively expands gate-name composition — plan pulls in story-ready's rules", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const storyReadyIds = new Set(expandGate("story-ready", gatesFile).map((r) => r.ruleId));
    const planIds = expandGate("plan", gatesFile).map((r) => r.ruleId);

    for (const id of storyReadyIds) {
      expect(planIds).toContain(id);
    }
    expect(planIds).toContain("chain/req-unimplemented");
    expect(planIds).toContain("link/cycles"); // also reachable via story-ready's link/*, deduplicated
    expect(new Set(planIds).size).toBe(planIds.length); // deduplicated
  });

  it("deduplicates a rule id reachable through two different paths", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    // link/cycles is pulled in both by story-ready's `link/*` and plan's own
    // explicit `link/cycles` entry — must appear exactly once.
    const planIds = expandGate("plan", gatesFile).map((r) => r.ruleId);
    expect(planIds.filter((id) => id === "link/cycles")).toHaveLength(1);
  });

  it("throws a clear error on cyclic gate composition", () => {
    const gatesFile = loadGatesFixture("cyclic.yaml");
    expect(() => expandGate("a", gatesFile)).toThrow(GateCompositionError);
    expect(() => expandGate("a", gatesFile)).toThrow(/cyclic gate composition: a -> b -> c -> a/);
  });

  it("throws a clear error referencing an undefined gate", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    expect(() => expandGate("does-not-exist", gatesFile)).toThrow(GateCompositionError);
  });

  it("parses ?scope= modifiers off rule ids without treating them as part of the id", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const streamDone = expandGate("stream-done", gatesFile);
    const doneHonest = streamDone.find((r) => r.ruleId === "chain/done-honest");
    expect(doneHonest).toBeDefined();
    expect(doneHonest?.scope).toBe("stream");
  });
});

describe("evaluateGate — severity elevation by gate context", () => {
  it("elevates a rule's severity per RULE_REGISTRY's gate-name override (chain/bug-regression: merge -> error)", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const stubChecker: RuleChecker = (artifact) => [
      {
        rule: "chain/bug-regression",
        severity: resolveSeverity("chain/bug-regression"), // "warn" standalone
        artifact: artifact.id,
        subject: "verifies",
        message: "stub finding for severity-elevation test",
      },
    ];

    const findings = evaluateGate("merge", gatesFile, {
      ruleCheckers: { "chain/bug-regression": stubChecker },
      artifacts: [{ id: "BG-0001", frontmatter: {} }],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "chain/bug-regression",
        severity: "error",
        artifact: "BG-0001",
      }),
    ]);
  });

  it("leaves severity at default when the enclosing gate has no override for that rule", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const stubChecker: RuleChecker = (artifact) => [
      {
        rule: "chain/bug-regression",
        severity: resolveSeverity("chain/bug-regression"),
        artifact: artifact.id,
        subject: "verifies",
        message: "stub finding",
      },
    ];

    const findings = evaluateGate("solo-check", gatesFile, {
      ruleCheckers: { "chain/bug-regression": stubChecker },
      artifacts: [{ id: "BG-0002", frontmatter: {} }],
    });

    expect(findings).toEqual([
      expect.objectContaining({ rule: "chain/bug-regression", severity: "warn" }),
    ]);
  });

  it("silently skips expanded rule ids the caller supplied no checker for", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const findings = evaluateGate("requirement-ready", gatesFile, {
      ruleCheckers: {},
      artifacts: [{ id: "RQ-0001", frontmatter: {} }],
    });
    expect(findings).toEqual([]);
  });

  it("runs a real rule (sec/committed-secret) end to end through a composed gate", () => {
    const gatesFile = loadGatesFixture("gates.yaml");
    const findings = evaluateGate("stream-done", gatesFile, {
      ruleCheckers: {
        "sec/committed-secret": (artifact) =>
          checkCommittedSecret(artifact.id, artifact.frontmatter, artifact.body),
      },
      artifacts: [
        {
          id: "ST-0001",
          frontmatter: {},
          body: readFixture("security/with-secret.md"),
        },
      ],
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "sec/committed-secret", severity: "error", artifact: "ST-0001" }),
      ]),
    );
  });
});
