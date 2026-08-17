import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { GatesFileSchema, ProfileManifestSchema } from "@ibuildos/schemas";
import { ProfileRegistry } from "./registry.js";
import { parseOkfDocument } from "../store/okf-document.js";

// Loads and validates the REAL shipped default profile at repo-root `docs/profile/` —
// not the minimal fixture stub at `packages/engine/fixtures/profile/` used by
// registry.test.ts. Covers SPEC.md §11's full type taxonomy (FORMATS.md §5 dialect).

const here = dirname(fileURLToPath(import.meta.url));
const profileRoot = join(here, "..", "..", "..", "..", "docs", "profile");

function profileFilenames(): string[] {
  return readdirSync(profileRoot)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

// `profile.md` is the profile manifest ({ name, version, formats }), not a TypeDefinition —
// exclude it from the TypeDefinition set, or `ProfileRegistry.fromRawDocuments` throws on its
// missing `type: TypeDefinition` literal.
function typeDefinitionDocs(): string[] {
  return profileFilenames()
    .filter((f) => f !== "profile.md")
    .map((f) => readFileSync(join(profileRoot, f), "utf8"));
}

describe("default type profile (docs/profile) — loads cleanly", () => {
  it("loads every docs/profile/*.md TypeDefinition through ProfileRegistry with zero errors", () => {
    expect(() => ProfileRegistry.fromRawDocuments(typeDefinitionDocs())).not.toThrow();
  });

  it("resolves every loaded type with resolveAll (implicit in fromRawDocuments)", () => {
    const registry = ProfileRegistry.fromRawDocuments(typeDefinitionDocs());
    // fromRawDocuments already calls resolveAll(); resolve() again here must be a cheap
    // cache hit for every defines name, proving resolution actually completed for each.
    const names = [
      "WorkItem",
      "ProductBrief",
      "Requirement",
      "Epic",
      "Story",
      "Task",
      "Bug",
      "Spike",
      "TestCase",
      "TestSuite",
      "TestResult",
      "Change",
      "Run",
      "Review",
      "Comment",
      "Deploy",
      "Release",
      "Milestone",
      "Decision",
      "Persona",
      "DesignDirection",
      "Architecture",
      "Runbook",
      "User",
      "Team",
      "MeetingNote",
      "StandupLog",
      "RetroAction",
    ];
    for (const name of names) {
      expect(() => registry.resolve(name)).not.toThrow();
    }
  });

  it("profile.md validates as a ProfileManifest", () => {
    const raw = readFileSync(join(profileRoot, "profile.md"), "utf8");
    const doc = parseOkfDocument(raw);
    const manifest = ProfileManifestSchema.parse(doc.frontmatter);
    expect(manifest).toEqual({ name: "ibuildos-default", version: "1.0.0", formats: 1 });
  });

  it("gates.yaml validates as a GatesFile and only references the seven shipped gates", () => {
    const raw = readFileSync(join(profileRoot, "gates.yaml"), "utf8");
    const gatesFile = GatesFileSchema.parse(parseYaml(raw));
    expect(Object.keys(gatesFile.gates).sort()).toEqual(
      [
        "merge",
        "plan",
        "release-deploy",
        "requirement-ready",
        "story-ready",
        "stream-done",
        "stream-stage",
      ].sort(),
    );
  });

  it("every transition `gate` referenced by a type resolves to a name in gates.yaml", () => {
    const registry = ProfileRegistry.fromRawDocuments(typeDefinitionDocs());
    const raw = readFileSync(join(profileRoot, "gates.yaml"), "utf8");
    const gatesFile = GatesFileSchema.parse(parseYaml(raw));
    const gateNames = new Set(Object.keys(gatesFile.gates));

    const defines = typeDefinitionDocs().map(
      (raw2) => parseOkfDocument(raw2).frontmatter["defines"] as string,
    );
    for (const name of defines) {
      const resolved = registry.resolve(name);
      for (const transition of resolved.states?.transitions ?? []) {
        if (transition.gate) {
          expect(gateNames.has(transition.gate), `${name}: unknown gate "${transition.gate}"`).toBe(
            true,
          );
        }
      }
    }
  });
});

// SPEC.md §11 "Core typed relationships" table, keyed by (fromType, relationship) — `parent`,
// `supersedes`, and `result_of` each appear more than once in the table with different
// From→To pairs, so relationship name alone isn't a unique key.
interface Relationship {
  from: string;
  rel: string;
  target: string[];
}

const relationships: Relationship[] = [
  { from: "Requirement", rel: "traces_to", target: ["ProductBrief", "Requirement"] },
  { from: "Epic", rel: "implements", target: ["Requirement"] },
  { from: "Story", rel: "implements", target: ["Requirement"] },
  { from: "Task", rel: "parent", target: ["Story"] },
  { from: "Story", rel: "parent", target: ["Epic"] },
  { from: "Story", rel: "depends_on", target: ["Story", "Task"] },
  { from: "Task", rel: "depends_on", target: ["Story", "Task"] },
  { from: "TestCase", rel: "verifies", target: ["Requirement", "Story", "Bug"] },
  { from: "Story", rel: "verified_by", target: ["TestCase"] },
  { from: "Task", rel: "verified_by", target: ["TestCase"] },
  { from: "Bug", rel: "affects", target: ["Requirement", "Story"] },
  { from: "Change", rel: "affects", target: ["Requirement", "Story"] },
  { from: "Bug", rel: "fixed_by", target: ["Task"] },
  { from: "Story", rel: "planned_for", target: ["Release", "Milestone"] },
  { from: "Bug", rel: "planned_for", target: ["Release", "Milestone"] },
  { from: "Decision", rel: "supersedes", target: ["Decision"] },
  { from: "Requirement", rel: "supersedes", target: ["Requirement"] },
  { from: "Requirement", rel: "serves", target: ["Persona"] },
  { from: "Story", rel: "serves", target: ["Persona"] },
  { from: "Decision", rel: "constrains", target: ["Requirement", "Story", "Architecture"] },
  { from: "TestCase", rel: "member_of", target: ["TestSuite"] },
  { from: "Story", rel: "honors", target: ["DesignDirection"] },
  { from: "Deploy", rel: "result_of", target: ["Release"] },
];

// Three §11 relationships are realized as plain typed FIELDS rather than `links:` entries
// (decided scope for this batch — see the referenced files' body text): `code` (Task, FORMATS
// §4), `external_ref` (the common `external` key, FORMATS §4), and Run's `result_of`
// (realized as the `subject` field, FORMATS §9). Documented here, not asserted as links.

describe("default type profile — SPEC.md §11 relationship coverage", () => {
  const registry = ProfileRegistry.fromRawDocuments(typeDefinitionDocs());

  it.each(relationships)(
    "$from.$rel declares target exactly $target",
    ({ from, rel, target }) => {
      const resolved = registry.resolve(from);
      expect(resolved.links[rel]?.target).toEqual(target);
    },
  );

  it.each(relationships)(
    "satisfies(): $from.$rel's declared target(s) are accepted, an unrelated type is rejected",
    ({ rel, target }) => {
      for (const targetType of target) {
        // Every declared target type is-or-extends itself.
        expect(registry.satisfies(targetType, targetType)).toBe(true);
      }
      // `User` never appears as any relationship's target in this table; its extends chain
      // is just itself, so it must fail every target check here — a real negative case,
      // not a vacuous one, since it exercises the same chain-membership code path.
      if (!target.includes("User")) {
        for (const targetType of target) {
          expect(registry.satisfies("User", targetType)).toBe(false);
        }
      }
    },
  );

  it("Task.code is a field (list<string>), not a links entry", () => {
    const task = registry.resolve("Task");
    expect(task.fields["code"]?.kind).toBe("list<string>");
    expect(task.links["code"]).toBeUndefined();
  });

  it("Run.subject realizes result_of as a field (list<string>), not a links entry", () => {
    const run = registry.resolve("Run");
    expect(run.fields["subject"]?.kind).toBe("list<string>");
    expect(run.links["result_of"]).toBeUndefined();
  });

  it("no link target names a type outside the shipped default profile (closure)", () => {
    const definedTypes = new Set(
      typeDefinitionDocs().map((raw) => parseOkfDocument(raw).frontmatter["defines"] as string),
    );
    for (const { from, rel, target } of relationships) {
      for (const targetType of target) {
        expect(
          definedTypes.has(targetType),
          `${from}.${rel} targets undefined type "${targetType}"`,
        ).toBe(true);
      }
    }
    // Sprint is deliberately out of scope for this batch (SPEC §11 marks it optional,
    // "Sprint?"); nothing in the shipped profile should target it.
    expect(definedTypes.has("Sprint")).toBe(false);
  });
});
