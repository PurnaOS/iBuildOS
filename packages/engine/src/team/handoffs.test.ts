import { describe, expect, it } from "vitest";
import { ProfileRegistry } from "../profile/registry.js";
import { readFixture } from "../test-utils/fixtures.js";
import { resolveHandoff, type HandoffMapping } from "./handoffs.js";

// Reuse the shipped conformance fixtures (same pattern as
// profile/registry.test.ts) so the transition data driving the legality
// check is real, normative FORMATS.md §5 data, not hand-rolled here.
function storyRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("profile/work-item.md"),
    readFixture("profile/story.md"),
    readFixture("profile/requirement.md"),
    readFixture("profile/test-case.md"),
    readFixture("profile/design-direction.md"),
    readFixture("profile/task.md"),
    readFixture("profile/epic.md"),
  ]);
}

function mapping(): HandoffMapping {
  return {
    Story: [
      // TM-007's own worked example: "ready for acceptance → PM".
      { from: "review", to: "accepted", handoffTo: { role: "PM" } },
      { from: ["accepted", "done"], to: "review", handoffTo: { user: "US-0001" } },
      { from: "*", to: "retired", handoffTo: { role: "Archivist" } },
      // Legal per the mapping's own bookkeeping, but not a real Story
      // transition — must never be honored once a registry is supplied.
      { from: "draft", to: "accepted", handoffTo: { team: "TM-0001" } },
    ],
  };
}

describe("resolveHandoff", () => {
  it("resolves the handoff target for a matching single-state transition", () => {
    expect(resolveHandoff(mapping(), "Story", "review", "accepted")).toEqual({ role: "PM" });
  });

  it("matches a list-valued `from` (CH-005 re-verification: accepted/done -> review)", () => {
    expect(resolveHandoff(mapping(), "Story", "accepted", "review")).toEqual({ user: "US-0001" });
    expect(resolveHandoff(mapping(), "Story", "done", "review")).toEqual({ user: "US-0001" });
  });

  it("matches a wildcard `from: \"*\"`", () => {
    expect(resolveHandoff(mapping(), "Story", "building", "retired")).toEqual({
      role: "Archivist",
    });
    expect(resolveHandoff(mapping(), "Story", "draft", "retired")).toEqual({
      role: "Archivist",
    });
  });

  it("returns undefined when no rule matches the transition — most transitions have none", () => {
    expect(resolveHandoff(mapping(), "Story", "building", "review")).toBeUndefined();
  });

  it("returns undefined for a type with no entry in the mapping at all", () => {
    expect(resolveHandoff(mapping(), "Task", "queued", "building")).toBeUndefined();
  });

  it("without a registry, honors any mapped rule regardless of real transition legality", () => {
    // "draft -> accepted" is not a declared Story transition, but with no
    // registry supplied there's nothing to check it against.
    expect(resolveHandoff(mapping(), "Story", "draft", "accepted")).toEqual({ team: "TM-0001" });
  });

  it("with a registry, only honors a rule whose transition is actually legal", () => {
    const registry = storyRegistry();
    expect(resolveHandoff(mapping(), "Story", "review", "accepted", registry)).toEqual({
      role: "PM",
    });
    // Mapped, but illegal per Story's real states.transitions — suppressed.
    expect(resolveHandoff(mapping(), "Story", "draft", "accepted", registry)).toBeUndefined();
  });

  it("with a registry, an unmapped-but-legal transition still yields undefined", () => {
    const registry = storyRegistry();
    // draft -> ready is a real, legal Story transition, but has no handoff rule.
    expect(resolveHandoff(mapping(), "Story", "draft", "ready", registry)).toBeUndefined();
  });
});
