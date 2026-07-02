import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, defaultChain } from "../src/core/config/config.ts";

test("defaults when no .ibuildos.yaml", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  const c = load(dir);
  expect(c.root).toBe("docs");
  expect(c.types).toBe("types");
  expect(c.artifacts).toEqual(["requirements/**", "work/**", "tests/**"]);
  expect(c.chain).toEqual(defaultChain());
  expect(c.rootDir()).toBe(join(dir, "docs"));
  expect(c.typesDir()).toBe(join(dir, "docs", "types"));
});

test("partial overlay overrides only named fields; chain sub-fields isolated", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  writeFileSync(
    join(dir, ".ibuildos.yaml"),
    "root: kb\nartifacts:\n  - reqs/**\nchain:\n  done_statuses: [closed]\n",
  );
  const c = load(dir);
  expect(c.root).toBe("kb");
  expect(c.artifacts).toEqual(["reqs/**"]);
  // overridden sub-field
  expect(c.chain.doneStatuses).toEqual(["closed"]);
  // every other chain sub-field keeps its default (not zeroed)
  expect(c.chain.implementsRel).toBe("implements");
  expect(c.chain.passingStatuses).toEqual(["passing"]);
});

test("link resolution + root-escape guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  const c = load(dir);
  expect(c.linkKey("/work/task-1.md")).toBe("/work/task-1.md");
  expect(c.linkKey("work/task-1.md")).toBe("/work/task-1.md");
  expect(c.resolveLink("/work/task-1.md")).toBe(join(dir, "docs", "work", "task-1.md"));
  expect(c.rootRel(join(dir, "docs", "work", "task-1.md"))).toBe("/work/task-1.md");
  expect(c.linkEscapesRoot(c.resolveLink("/work/task-1.md"))).toBe(false);
  expect(c.linkEscapesRoot(join(dir, "secret.md"))).toBe(true); // outside docs/
  expect(c.typesDirOverride === "").toBe(true);
});
