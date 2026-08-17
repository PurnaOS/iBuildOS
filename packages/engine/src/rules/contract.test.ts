import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { readFixture } from "../test-utils/fixtures.js";
import { checkContractTrusted, checkContractValid, computeContractHash } from "./contract.js";

function loadContractFixture(name: string): unknown {
  return parseYaml(readFixture(`contract/${name}`));
}

describe("contract/valid", () => {
  it("green path: ibuildos.yaml parses and every referenced command exists", () => {
    const config = loadContractFixture("ibuildos.yaml");
    expect(checkContractValid("ibuildos.yaml", config)).toEqual([]);
  });

  it("red path: invalid-ordered-command.yaml references undeclared commands", () => {
    const config = loadContractFixture("invalid-ordered-command.yaml");
    const findings = checkContractValid("ibuildos.yaml", config);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "contract/valid",
          severity: "error",
          subject: "contract.components.web.ordered.migrations.command",
        }),
        expect.objectContaining({
          rule: "contract/valid",
          severity: "error",
          subject: "contract.components.web.safe",
        }),
      ]),
    );
  });

  it("red path: a config that doesn't match the schema at all", () => {
    const findings = checkContractValid("ibuildos.yaml", { formats: 1 });
    expect(findings).toEqual([
      expect.objectContaining({ rule: "contract/valid", severity: "error" }),
    ]);
  });
});

describe("contract/trusted", () => {
  it("green path: hash of the untouched contract matches the trusted hash", () => {
    const config = loadContractFixture("ibuildos.yaml") as { contract: unknown };
    const trustedHash = computeContractHash(config.contract);

    expect(checkContractTrusted("ibuildos.yaml", config.contract, trustedHash)).toEqual([]);
  });

  it("red path: tampered-contract.yaml's contract hash no longer matches the trusted hash", () => {
    const original = loadContractFixture("ibuildos.yaml") as { contract: unknown };
    const tampered = loadContractFixture("tampered-contract.yaml") as { contract: unknown };
    const trustedHash = computeContractHash(original.contract);

    const findings = checkContractTrusted("ibuildos.yaml", tampered.contract, trustedHash);

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "contract/trusted",
        severity: "error",
        artifact: "ibuildos.yaml",
        subject: "contract",
      }),
    ]);
  });

  it("canonical JSON hash is stable regardless of key order", () => {
    const a = computeContractHash({ b: 1, a: 2 });
    const b = computeContractHash({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
});
