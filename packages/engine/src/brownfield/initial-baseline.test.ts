import { describe, expect, it } from "vitest";
import type { Finding } from "@ibuildos/schemas";
import { loadBaseline, serializeBaseline, isBaselined, applyBaseline } from "../baseline/index.js";
import { fingerprint } from "../baseline/fingerprint.js";
import { generateInitialBaseline } from "./initial-baseline.js";

const FINDINGS: Finding[] = [
  {
    rule: "chain/story-untested",
    severity: "error",
    artifact: "ST-0012",
    subject: "verified_by",
    message: "ST-0012 has no passing verified_by evidence",
  },
  {
    rule: "doc/field-required",
    severity: "error",
    artifact: "ST-0099",
    subject: "owner",
    message: 'required field "owner" is missing',
  },
  // duplicate of the first finding (same rule + artifact + subject, different message) —
  // FORMATS §8: "two findings on the same rule+artifact+subject are one baseline entry"
  {
    rule: "chain/story-untested",
    severity: "error",
    artifact: "ST-0012",
    subject: "verified_by",
    message: "a slightly different message on re-run, same underlying finding",
  },
];

describe("generateInitialBaseline", () => {
  it("produces one entry per distinct rule+artifact+fp, deduplicating repeats", () => {
    const baseline = generateInitialBaseline(FINDINGS, {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
    });

    expect(baseline.entries).toHaveLength(2);
    expect(baseline.entries).toEqual(
      expect.arrayContaining([
        { rule: "chain/story-untested", artifact: "ST-0012", fp: fingerprint(FINDINGS[0]!) },
        { rule: "doc/field-required", artifact: "ST-0099", fp: fingerprint(FINDINGS[1]!) },
      ]),
    );
  });

  it("records formats/engine/profile/generated per FORMATS §8", () => {
    const baseline = generateInitialBaseline(FINDINGS, {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
    });

    expect(baseline.formats).toBe(1);
    expect(baseline.engine).toBe("1.0.0");
    expect(baseline.profile).toBe("ibuildos-default@1.0.0");
    expect(baseline.generated).toBe("2026-08-16T10:00:00Z");
    expect(baseline.scope_events).toEqual([]);
  });

  it("records a day-one scope-expansion event when adoption starts pre-scoped (BF-005)", () => {
    const baseline = generateInitialBaseline(FINDINGS, {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
      initialScope: { addedPaths: ["src/legacy/**"] },
    });

    expect(baseline.scope_events).toEqual([
      { at: "2026-08-16", added_paths: ["src/legacy/**"], entries: 2 },
    ]);
  });

  it("honors a finding's precomputed fp instead of recomputing it", () => {
    const stamped: Finding = {
      rule: "link/target-exists",
      severity: "error",
      artifact: "ST-0500",
      subject: "verified_by",
      message: "TC-0099 does not exist",
      fp: "0000000000000abc",
    };

    const baseline = generateInitialBaseline([stamped], {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
    });

    expect(baseline.entries).toEqual([
      { rule: "link/target-exists", artifact: "ST-0500", fp: "0000000000000abc" },
    ]);
  });

  it("round-trips end to end through serializeBaseline/loadBaseline", () => {
    const generated = generateInitialBaseline(FINDINGS, {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
      initialScope: { addedPaths: ["src/legacy/**"] },
    });

    const serialized = serializeBaseline(generated);
    const reloaded = loadBaseline(serialized);

    // generateInitialBaseline documents that its `entries` are in encounter order, not the
    // canonical sort serializeBaseline applies on write — so this deliberately checks entry
    // *content* order-independently (a set of rule/artifact/fp triples), rather than deep
    // object equality against `generated`, which would only hold by coincidence of this
    // fixture's encounter order already matching the canonical sort.
    const entryKey = (e: { rule: string; artifact: string; fp: string }) =>
      `${e.rule}\0${e.artifact}\0${e.fp}`;
    expect(new Set(reloaded.entries.map(entryKey))).toEqual(new Set(generated.entries.map(entryKey)));
    expect(reloaded.entries).toHaveLength(generated.entries.length);
    expect(reloaded.formats).toBe(generated.formats);
    expect(reloaded.engine).toBe(generated.engine);
    expect(reloaded.profile).toBe(generated.profile);
    expect(reloaded.generated).toBe(generated.generated);
    expect(reloaded.scope_events).toEqual(generated.scope_events);

    // idempotent: re-serializing the reloaded value reproduces the same bytes — this is what
    // actually proves the round trip is lossless under serializeBaseline's canonical order,
    // independent of what order generateInitialBaseline happened to emit entries in.
    expect(serializeBaseline(reloaded)).toBe(serialized);
  });

  it("the generated baseline behaves like any other baseline for isBaselined/applyBaseline", () => {
    const generated = generateInitialBaseline(FINDINGS, {
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-16T10:00:00Z",
    });

    // Re-running the same first-pass findings: everything should now be baselined (accepted
    // debt), not blocking — this is the whole point of BF-006's day-one baseline.
    const { blocking, baselined } = applyBaseline(generated, FINDINGS);
    expect(blocking).toEqual([]);
    expect(baselined).toHaveLength(FINDINGS.length);

    // A brand-new finding not present on day one is not baselined and would block.
    const newFinding: Finding = {
      rule: "doc/field-required",
      severity: "error",
      artifact: "ST-0700",
      subject: "owner",
      message: 'required field "owner" is missing',
    };
    expect(isBaselined(generated, newFinding)).toBe(false);
  });
});
