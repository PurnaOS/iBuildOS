import { describe, expect, it } from "vitest";
import type { Baseline, Finding } from "@ibuildos/schemas";
import { readFixture } from "../test-utils/fixtures.js";
import { applyBaseline, checkShrinkOnly, isBaselined, loadBaseline, serializeBaseline } from "./baseline.js";
import { fingerprint } from "./fingerprint.js";

const FIXTURE_ENTRY = { rule: "chain/story-untested", artifact: "ST-0012", fp: "9f2ab4c1d0e88a37" };

function baselineFixture(): Baseline {
  return loadBaseline(readFixture("baseline/baseline.json"));
}

describe("loadBaseline — FORMATS §8 worked example", () => {
  it("parses the committed fixture into the expected shape", () => {
    const baseline = baselineFixture();

    expect(baseline.formats).toBe(1);
    expect(baseline.engine).toBe("1.0.0");
    expect(baseline.profile).toBe("ibuildos-default@1.0.0");
    expect(baseline.scope_events).toEqual([
      { at: "2026-08-14", added_paths: ["src/legacy/**"], entries: 214 },
    ]);
    expect(baseline.entries).toEqual([FIXTURE_ENTRY]);
  });
});

describe("isBaselined", () => {
  it("recognizes the fixture's one entry via a finding carrying the same fp", () => {
    const baseline = baselineFixture();
    const finding: Finding = {
      rule: "chain/story-untested",
      severity: "error",
      artifact: "ST-0012",
      subject: "verified_by",
      message: "ST-0012 has no passing verified_by evidence",
      fp: FIXTURE_ENTRY.fp,
    };

    expect(isBaselined(baseline, finding)).toBe(true);
  });

  it("does not match on rule + artifact alone — the fingerprint must also match", () => {
    const baseline = baselineFixture();
    const finding: Finding = {
      rule: "chain/story-untested",
      severity: "error",
      artifact: "ST-0012",
      subject: "some-other-subject-entirely",
      message: "a different finding on the same rule + artifact",
      // no fp: forces isBaselined to compute one from rule/artifact/subject, which
      // will not equal the fixture's hand-set 9f2ab4c1d0e88a37.
    };

    expect(isBaselined(baseline, finding)).toBe(false);
  });

  it("computes the fingerprint from rule/artifact/subject when the finding has no fp", () => {
    const findingWithoutFp: Finding = {
      rule: "doc/field-required",
      severity: "error",
      artifact: "ST-0099",
      subject: "owner",
      message: 'required field "owner" is missing',
    };
    const baseline: Baseline = {
      formats: 1,
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-14T10:00:00Z",
      scope_events: [],
      entries: [{ rule: "doc/field-required", artifact: "ST-0099", fp: fingerprint(findingWithoutFp) }],
    };

    expect(isBaselined(baseline, findingWithoutFp)).toBe(true);
  });
});

describe("applyBaseline", () => {
  it("partitions findings into baselined (accepted debt) vs blocking (new)", () => {
    const baseline = baselineFixture();
    const alreadyBaselined: Finding = {
      rule: "chain/story-untested",
      severity: "error",
      artifact: "ST-0012",
      subject: "verified_by",
      message: "ST-0012 has no passing verified_by evidence",
      fp: FIXTURE_ENTRY.fp,
    };
    const brandNew: Finding = {
      rule: "doc/field-required",
      severity: "error",
      artifact: "ST-0100",
      subject: "owner",
      message: 'required field "owner" is missing',
    };

    const { blocking, baselined } = applyBaseline(baseline, [alreadyBaselined, brandNew]);

    expect(baselined).toEqual([alreadyBaselined]);
    // blocking findings are stamped with fp so they can be copied straight into baseline.json
    expect(blocking).toEqual([{ ...brandNew, fp: fingerprint(brandNew) }]);
  });
});

describe("serializeBaseline", () => {
  it("is idempotent — serializing what was just parsed reproduces the same bytes", () => {
    const baseline = baselineFixture();
    const once = serializeBaseline(baseline);

    expect(serializeBaseline(loadBaseline(once))).toBe(once);
  });

  it("sorts entries deterministically by rule + artifact + fp", () => {
    const baseline: Baseline = {
      formats: 1,
      engine: "1.0.0",
      profile: "ibuildos-default@1.0.0",
      generated: "2026-08-14T10:00:00Z",
      scope_events: [],
      entries: [
        { rule: "doc/field-required", artifact: "ST-0099", fp: "ffffffffffffffff" },
        { rule: "chain/story-untested", artifact: "ST-0012", fp: "9f2ab4c1d0e88a37" },
        { rule: "doc/field-required", artifact: "ST-0001", fp: "0000000000000000" },
      ],
    };

    const reparsed = loadBaseline(serializeBaseline(baseline));

    expect(reparsed.entries.map((e) => `${e.rule}/${e.artifact}`)).toEqual([
      "chain/story-untested/ST-0012",
      "doc/field-required/ST-0001",
      "doc/field-required/ST-0099",
    ]);
  });
});

describe("checkShrinkOnly", () => {
  const previous: Baseline = {
    formats: 1,
    engine: "1.0.0",
    profile: "ibuildos-default@1.0.0",
    generated: "2026-08-14T10:00:00Z",
    scope_events: [{ at: "2026-08-14", added_paths: ["src/legacy/**"], entries: 214 }],
    entries: [
      { rule: "chain/story-untested", artifact: "ST-0012", fp: "9f2ab4c1d0e88a37" },
      { rule: "doc/field-required", artifact: "ST-0099", fp: "e0f36ac8bd4b5c1a" },
    ],
  };

  it("accepts a shrink (an entry fixed and removed)", () => {
    const next: Baseline = {
      ...previous,
      generated: "2026-08-15T10:00:00Z",
      entries: [{ rule: "chain/story-untested", artifact: "ST-0012", fp: "9f2ab4c1d0e88a37" }],
    };

    const result = checkShrinkOnly(previous, next);

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it("accepts growth justified by a newly recorded scope_events entry", () => {
    const newEntry = { rule: "chain/story-untested", artifact: "ST-0500", fp: "aaaaaaaaaaaaaaaa" };
    const next: Baseline = {
      ...previous,
      generated: "2026-08-16T10:00:00Z",
      scope_events: [
        ...previous.scope_events,
        { at: "2026-08-16", added_paths: ["src/vendor/**"], entries: 1 },
      ],
      entries: [...previous.entries, newEntry],
    };

    const result = checkShrinkOnly(previous, next);

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it("rejects an unscoped growth — a new entry with no corresponding new scope event", () => {
    const newEntry = { rule: "chain/story-untested", artifact: "ST-0501", fp: "bbbbbbbbbbbbbbbb" };
    const next: Baseline = {
      ...previous,
      generated: "2026-08-16T10:00:00Z",
      entries: [...previous.entries, newEntry],
    };

    const result = checkShrinkOnly(previous, next);

    expect(result).toEqual({ ok: false, violations: [newEntry] });
  });
});
