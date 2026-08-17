import { describe, expect, it } from "vitest";
import { ComponentEnvelopeSchema } from "@ibuildos/schemas";
import { buildChangeSetProposal } from "./proposal.js";

describe("buildChangeSetProposal", () => {
  it("shapes a representative re-plan as a schema-valid change-set envelope", () => {
    const envelope = buildChangeSetProposal({
      cid: "cs-0001",
      title: "Re-plan for RQ-0001's revised acceptance criteria",
      body: "RQ-0001's AC-2 changed from 'X' to 'Y'; ST-0002 and TC-0001 need to follow.",
      change: "CH-0001",
      stories: [
        { id: "ST-0002", action: "revise", rationale: "AC-2 no longer matches", implements: ["RQ-0001#AC-2"] },
        { action: "add", rationale: "new sub-case introduced by the revision", implements: ["RQ-0001#AC-2"] },
        { id: "ST-0005", action: "retire", rationale: "superseded by the revised split" },
      ],
      testCases: [
        { id: "TC-0001", action: "update", rationale: "assertion referenced the old criterion text", verifies: ["ST-0002"] },
        { action: "add", rationale: "covers the new sub-case Story" },
      ],
    });

    // Not a parallel shape: re-validating the module's own output against the shared
    // schema must independently succeed.
    const result = ComponentEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);

    expect(envelope.v).toBe(1);
    expect(envelope.kind).toBe("change-set");
    expect(envelope.cid).toBe("cs-0001");
    expect(envelope.title).toContain("RQ-0001");
    expect(envelope["change"]).toBe("CH-0001");
    expect(envelope["stories"]).toHaveLength(3);
    expect(envelope["testCases"]).toHaveLength(2);
  });

  it("defaults stories/testCases to empty arrays when omitted", () => {
    const envelope = buildChangeSetProposal({ cid: "cs-0002" });
    expect(ComponentEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope["stories"]).toEqual([]);
    expect(envelope["testCases"]).toEqual([]);
    expect(envelope.title).toBeUndefined();
  });

  it("rejects a proposal missing the required cid", () => {
    // @ts-expect-error — cid is required by ChangeSetProposalInput; this exercises the
    // schema-level guarantee for a caller that bypasses the type (e.g. deserialized JSON).
    expect(() => buildChangeSetProposal({})).toThrow();
  });
});
