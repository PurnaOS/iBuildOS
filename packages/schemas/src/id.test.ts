import { describe, expect, it } from "vitest";
import {
  ArtifactIdSchema,
  CriterionRefSchema,
  ProvisionalIdSchema,
  idPrefix,
  isFinalId,
  isProvisionalId,
} from "./id.js";

describe("artifact ID grammar (FORMATS.md §2)", () => {
  it("accepts a well-formed final ID and canonicalizes case", () => {
    expect(ArtifactIdSchema.parse("st-0042")).toBe("ST-0042");
    expect(isFinalId("ST-0042")).toBe(true);
  });

  it("accepts 5+ digit IDs without re-padding", () => {
    expect(isFinalId("ST-10023")).toBe(true);
  });

  it("rejects an unknown prefix or a too-short number", () => {
    expect(() => ArtifactIdSchema.parse("STORY-42")).toThrow();
    expect(() => ArtifactIdSchema.parse("ST-42")).toThrow();
  });

  it("accepts a provisional ID and rejects a malformed one", () => {
    expect(() => ProvisionalIdSchema.parse("TC-pa3f9-2")).not.toThrow();
    expect(isProvisionalId("TC-pa3f9-2")).toBe(true);
    expect(() => ProvisionalIdSchema.parse("TC-pa3f9")).toThrow();
  });

  it("accepts a criterion reference", () => {
    expect(() => CriterionRefSchema.parse("ST-0042#AC-2")).not.toThrow();
    expect(() => CriterionRefSchema.parse("ST-0042")).toThrow();
  });

  it("extracts the prefix of an ID", () => {
    expect(idPrefix("ST-0042")).toBe("ST");
    expect(idPrefix("XX-0042")).toBeNull();
  });
});
