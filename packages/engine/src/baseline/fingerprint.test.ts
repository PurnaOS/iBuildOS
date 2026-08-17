import { describe, expect, it } from "vitest";
import type { Finding } from "@ibuildos/schemas";
import { fingerprint } from "./fingerprint.js";

describe("fingerprint", () => {
  it("is deterministic for the same rule + artifact + subject", () => {
    const a = fingerprint({ rule: "chain/story-untested", artifact: "ST-0012", subject: "verified_by" });
    const b = fingerprint({ rule: "chain/story-untested", artifact: "ST-0012", subject: "verified_by" });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores fields other than rule/artifact/subject — same fp despite a different message", () => {
    const findingA: Finding = {
      rule: "doc/field-required",
      severity: "error",
      artifact: "ST-0042",
      subject: "owner",
      message: 'required field "owner" is missing at line 4',
    };
    const findingB: Finding = {
      rule: "doc/field-required",
      severity: "error",
      artifact: "ST-0042",
      subject: "owner",
      message: "the artifact was edited elsewhere and now the message reads completely differently",
    };

    expect(fingerprint(findingA)).toBe(fingerprint(findingB));
  });

  it("changes when the subject changes, holding rule + artifact fixed", () => {
    const owner = fingerprint({ rule: "doc/field-required", artifact: "ST-0042", subject: "owner" });
    const state = fingerprint({ rule: "doc/field-required", artifact: "ST-0042", subject: "state" });

    expect(owner).not.toBe(state);
  });

  it("changes when the artifact changes, holding rule + subject fixed", () => {
    const st1 = fingerprint({ rule: "chain/story-untested", artifact: "ST-0001", subject: "verified_by" });
    const st2 = fingerprint({ rule: "chain/story-untested", artifact: "ST-0002", subject: "verified_by" });

    expect(st1).not.toBe(st2);
  });

  it("changes when the rule changes, holding artifact + subject fixed", () => {
    const a = fingerprint({ rule: "doc/field-required", artifact: "ST-0042", subject: "owner" });
    const b = fingerprint({ rule: "doc/field-kind", artifact: "ST-0042", subject: "owner" });

    expect(a).not.toBe(b);
  });
});
