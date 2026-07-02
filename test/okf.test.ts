import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { split, parse } from "../src/core/okf/frontmatter.ts";
import { matchFiles, anyMatch, pathCaseMatches } from "../src/core/okf/glob.ts";

// Mirrors Go TestSplit.
test("split", () => {
  const cases: Array<{ name: string; in: string; ok: boolean; err: boolean; front?: string; body?: string }> = [
    { name: "basic", in: "---\na: 1\n---\nbody\n", ok: true, err: false, front: "a: 1", body: "body\n" },
    { name: "no frontmatter", in: "# just markdown\n", ok: false, err: false, body: "# just markdown\n" },
    { name: "empty frontmatter", in: "---\n---\nbody", ok: true, err: false, front: "", body: "body" },
    { name: "crlf", in: "---\r\na: 1\r\n---\r\nbody\r\n", ok: true, err: false, front: "a: 1", body: "body\n" },
    { name: "unterminated", in: "---\na: 1\nno closing fence\n", ok: false, err: true },
    { name: "dashes in body", in: "---\nt: x\n---\nintro\n\n---\n\nmore\n", ok: true, err: false, front: "t: x", body: "intro\n\n---\n\nmore\n" },
  ];
  for (const c of cases) {
    const r = split(c.in);
    expect(r.err !== null, c.name).toBe(c.err);
    if (c.err) continue;
    expect(r.ok, c.name).toBe(c.ok);
    if (c.ok) expect(r.front, c.name).toBe(c.front!);
    expect(r.body, c.name).toBe(c.body!);
  }
});

// Mirrors Go TestParseLineNumbers.
test("parse line numbers account for frontmatter offset", () => {
  const [d, err] = parse("x.md", "---\ntype: Task\nid: TASK-1\nstatus: done\n---\nbody\n");
  expect(err).toBeNull();
  const g = d.get("status");
  expect(g).toBeDefined();
  expect(d.line(g!.keyNode)).toBe(4);
});

// Mirrors Go TestParseSkipsBOM.
test("parse skips BOM", () => {
  const [d, err] = parse("x.md", "﻿---\ntype: Task\n---\n");
  expect(err).toBeNull();
  expect(d.hasFrontmatter).toBe(true);
  expect(d.get("type")!.valNode).toMatchObject({ value: "Task" });
});

// Mirrors Go TestLinks.
test("links: sequence and scalar forms", () => {
  const [d, err] = parse("x.md", "---\ntype: Task\nlinks:\n  implements: [/r/a.md, /r/b.md]\n  parent: /w/s.md\n---\n");
  expect(err).toBeNull();
  const links = d.links();
  expect(links["implements"]!.length).toBe(2);
  expect(links["parent"]!.length).toBe(1);
  expect(links["parent"]![0]!.raw).toBe("/w/s.md");
});

test("duplicate top-level keys + link rels detected, sorted", () => {
  const [d] = parse("x.md", "---\ntype: Task\ntype: Bug\nlinks:\n  parent: /a.md\n  parent: /b.md\n---\n");
  expect(d.duplicateTopLevelKeys()).toEqual(["type"]);
  expect(d.duplicateLinkRels()).toEqual(["parent"]);
  // get() returns the first occurrence (matches Go's Content walk).
  expect(d.get("type")!.valNode).toMatchObject({ value: "Task" });
});

test("empty frontmatter is a valid empty mapping", () => {
  const [d, err] = parse("x.md", "---\n---\nbody");
  expect(err).toBeNull();
  expect(d.hasFrontmatter).toBe(true);
  expect(d.keys()).toEqual([]);
  expect(d.toJS()).toEqual({});
});

test("non-mapping frontmatter is an error", () => {
  const [, err] = parse("x.md", "---\n- a\n- b\n---\n");
  expect(err).not.toBeNull();
});

test("prose file: no frontmatter, no error", () => {
  const [d, err] = parse("x.md", "# Heading\n\ntext\n");
  expect(err).toBeNull();
  expect(d.hasFrontmatter).toBe(false);
});

// --- glob + case-exact matching ---

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "okf-glob-"));
  mkdirSync(join(dir, "requirements", "sub"), { recursive: true });
  writeFileSync(join(dir, "requirements", "a.md"), "x");
  writeFileSync(join(dir, "requirements", "sub", "b.md"), "x");
  writeFileSync(join(dir, "requirements", "note.txt"), "x");
  return dir;
}

test("matchFiles: ** matches direct and nested children, sorted+deduped", () => {
  const dir = fixture();
  expect(matchFiles(dir, ["requirements/**"])).toEqual([
    "requirements/a.md",
    "requirements/note.txt",
    "requirements/sub/b.md",
  ]);
  // leading slash tolerated; dedupe across overlapping globs
  expect(matchFiles(dir, ["/requirements/**", "requirements/**"])).toEqual([
    "requirements/a.md",
    "requirements/note.txt",
    "requirements/sub/b.md",
  ]);
});

test("anyMatch", () => {
  const dir = fixture();
  expect(anyMatch(dir, ["requirements/a.md"])).toBe(true);
  expect(anyMatch(dir, ["requirements/missing.md"])).toBe(false);
});

test("pathCaseMatches rejects wrong case and ..", () => {
  const dir = fixture();
  expect(pathCaseMatches(dir, "requirements/a.md")).toBe(true);
  expect(pathCaseMatches(dir, "requirements/A.md")).toBe(false);
  expect(pathCaseMatches(dir, "Requirements/a.md")).toBe(false);
  expect(pathCaseMatches(dir, "requirements/../requirements/a.md")).toBe(false);
});
