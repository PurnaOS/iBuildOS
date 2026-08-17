import { describe, expect, it } from "vitest";
import { readFixture } from "../test-utils/fixtures.js";
import { checkCommittedSecret } from "./security.js";

describe("sec/committed-secret", () => {
  it("green path: clean.md has no findings", () => {
    const body = readFixture("security/clean.md");
    const findings = checkCommittedSecret("ST-0001", {}, body);
    expect(findings).toEqual([]);
  });

  it("red path: with-secret.md flags a known-pattern key and a suspicious key/value", () => {
    const body = readFixture("security/with-secret.md");
    const findings = checkCommittedSecret("ST-0002", {}, body);

    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "sec/committed-secret",
          severity: "error",
          artifact: "ST-0002",
          subject: "openai-style-key",
        }),
        expect.objectContaining({
          rule: "sec/committed-secret",
          severity: "error",
          artifact: "ST-0002",
          subject: "token",
        }),
      ]),
    );
  });

  it("also scans frontmatter, not just body", () => {
    const findings = checkCommittedSecret("ST-0003", { note: "AKIA1234567890ABCDEF" });
    expect(findings).toEqual([
      expect.objectContaining({ rule: "sec/committed-secret", subject: "aws-access-key-id" }),
    ]);
  });
});
