import { resolveSeverity, type Finding } from "@ibuildos/schemas";
import type { ProfileRegistry, ResolvedType } from "../profile/registry.js";
import { ArtifactGraph, baseArtifactId } from "../graph/graph.js";
import { checkLinkTargetExists } from "./links.js";

// FORMATS.md §6 — the chain/* rule family (the Requirement -> Task -> Code ->
// Test traceability chain) plus docs/todo-marker, grouped here because both
// need the whole-bundle graph rather than just one artifact's own
// frontmatter.

// --- a minimal, dependency-free glob matcher --------------------------------
//
// chain/task-no-code and chain/code-unlinked both need to know whether a
// Task's `code` globs match real files. Rather than pull in a glob library
// or require every caller to inject a matcher, this supports the subset of
// glob syntax FORMATS' own examples use: `*` (any run of non-slash chars),
// `**` (any run of chars, across slashes; `**/ ` also matches zero
// directories, so `src/**/*.ts` matches `src/foo.ts` too), and `?` (one
// non-slash char). No brace/bracket expansion.

function globToRegExp(glob: string): RegExp {
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 3;
      } else {
        pattern += ".*";
        i += 2;
      }
    } else if (c === "*") {
      pattern += "[^/]*";
      i += 1;
    } else if (c === "?") {
      pattern += "[^/]";
      i += 1;
    } else if (".+^${}()|[]\\".includes(c)) {
      pattern += `\\${c}`;
      i += 1;
    } else {
      pattern += c;
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchGlob(glob: string, filePath: string): boolean {
  return globToRegExp(glob).test(filePath);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** `chain/req-unimplemented` (warn) — a Requirement that has reached "ready"
 * or beyond needs at least one implementing Story. "Ready+" is read off the
 * type's own vocabulary order (`vocabulary.indexOf(state) >=
 * vocabulary.indexOf("ready")`) rather than a hardcoded state name list,
 * since FORMATS never fixes Requirement's exact vocabulary. Types whose
 * vocabulary has no "ready" state skip this check entirely (it doesn't
 * apply to them). */
export function checkReqUnimplemented(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  const vocabulary = type.states?.vocabulary;
  if (!vocabulary) return [];
  const readyIndex = vocabulary.indexOf("ready");
  if (readyIndex === -1) return [];

  const current = typeof frontmatter.state === "string" ? frontmatter.state : undefined;
  if (!current) return [];
  const currentIndex = vocabulary.indexOf(current);
  if (currentIndex === -1 || currentIndex < readyIndex) return [];

  const implemented = graph.incoming(artifactId, "implements").some((edge) => {
    const source = graph.get(edge.from);
    return source && registry.has(source.type) && registry.satisfies(source.type, "Story");
  });
  if (implemented) return [];

  return [
    {
      rule: "chain/req-unimplemented",
      severity: resolveSeverity("chain/req-unimplemented", context),
      artifact: artifactId,
      subject: "implements",
      message: `Requirement "${artifactId}" is "${current}" but has no implementing Story`,
    },
  ];
}

/** `chain/story-untested` (error@merge) — a Story needs `verified_by`
 * evidence: at least one linked TestCase, and at least one TestResult
 * (anywhere in the bundle) whose `subject` is one of those TestCase IDs and
 * whose `verdict` is `"pass"`. No-ops for types that don't declare a
 * `verified_by` relationship at all (so `chain/done-honest` can call this
 * unconditionally for any "done" artifact, Task or Story alike). */
export function checkStoryUntested(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  if (!type.links.verified_by) return [];

  const links = frontmatter.links;
  const raw =
    typeof links === "object" && links !== null && !Array.isArray(links)
      ? (links as Record<string, unknown>).verified_by
      : undefined;
  const targets = stringList(raw).map((t) => baseArtifactId(t));

  const fail = (message: string): Finding[] => [
    {
      rule: "chain/story-untested",
      severity: resolveSeverity("chain/story-untested", context),
      artifact: artifactId,
      subject: "verified_by",
      message,
    },
  ];

  if (targets.length === 0) return fail("no verified_by evidence linked");

  const hasPassingEvidence = graph.allArtifacts().some((a) => {
    if (!registry.has(a.type) || !registry.satisfies(a.type, "TestResult")) return false;
    if (typeof a.frontmatter.subject !== "string") return false;
    return targets.includes(baseArtifactId(a.frontmatter.subject)) && a.frontmatter.verdict === "pass";
  });

  return hasPassingEvidence ? [] : fail("linked TestCase(s) have no passing TestResult evidence");
}

/** `chain/task-no-code` (error) — a `done` Task's `code` globs must each
 * match at least one file in `allFiles`. One finding per unmatched glob
 * (FORMATS §8 lists "the glob string" as a valid finding subject, so this
 * is per-glob, not one finding for the whole `code` list). Real filesystem
 * access is the caller's job — `allFiles` is injected, mirroring
 * `doc/body-link`'s injected `linkExists`. */
export function checkTaskNoCode(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  allFiles: readonly string[],
  context?: string,
): Finding[] {
  if (frontmatter.state !== "done") return [];
  const globs = stringList(frontmatter.code);
  if (globs.length === 0) return [];

  const findings: Finding[] = [];
  for (const glob of globs) {
    if (!allFiles.some((file) => matchGlob(glob, file))) {
      findings.push({
        rule: "chain/task-no-code",
        severity: resolveSeverity("chain/task-no-code", context),
        artifact: artifactId,
        subject: glob,
        message: `done Task's code glob "${glob}" matches no files in scope`,
      });
    }
  }
  return findings;
}

/** `chain/code-unlinked` (info) — a source file in the adopted scope
 * (`allFiles`) that no Task's `code` glob matches at all. Bundle-wide (every
 * Task's globs count), so this takes the whole Task list rather than one
 * artifact. `artifact` on the finding is the file path itself — there's no
 * artifact ID for an unowned source file, and `Finding.artifact` is a free
 * string, not required to be an ID. */
export function checkCodeUnlinked(
  tasks: readonly { frontmatter: Record<string, unknown> }[],
  allFiles: readonly string[],
  context?: string,
): Finding[] {
  const globs = tasks.flatMap((t) => stringList(t.frontmatter.code));

  const findings: Finding[] = [];
  for (const file of allFiles) {
    if (!globs.some((glob) => matchGlob(glob, file))) {
      findings.push({
        rule: "chain/code-unlinked",
        severity: resolveSeverity("chain/code-unlinked", context),
        artifact: file,
        subject: "code",
        message: `source file "${file}" is in the adopted scope but no Task's code globs reference it`,
      });
    }
  }
  return findings;
}

/** `chain/done-honest` (error) — VG-007 composite: `done` means merged code
 * + passing tests + an intact link chain, all at once. Rather than invent
 * new semantics, this re-runs the three checks that already cover each leg
 * (`chain/task-no-code`, `chain/story-untested`, `link/target-exists`) and
 * re-stamps whatever they find under this rule's own id/severity — each
 * sub-check already no-ops for artifact shapes it doesn't apply to (a Story
 * has no `code` field, a Task has no `verified_by` link), so calling all
 * three unconditionally is safe. */
export function checkDoneHonest(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  allFiles: readonly string[],
  context?: string,
): Finding[] {
  if (frontmatter.state !== "done") return [];
  const severity = resolveSeverity("chain/done-honest", context);
  const restamp = (findings: Finding[]): Finding[] =>
    findings.map((f) => ({ ...f, rule: "chain/done-honest", severity }));

  return [
    ...restamp(checkTaskNoCode(artifactId, frontmatter, allFiles, context)),
    ...restamp(checkStoryUntested(artifactId, frontmatter, type, graph, registry, context)),
    ...restamp(checkLinkTargetExists(artifactId, frontmatter, graph, context)),
  ];
}

/** `chain/bug-regression` (error@merge) — a Bug needs at least one TestCase
 * linking `verifies: [<this Bug's ID>]` so the regression it fixed has
 * coverage (ST-009). Reverse-index lookup on the `verifies` relationship,
 * same shape as `chain/req-unimplemented`'s `implements` lookup. */
export function checkBugRegression(
  artifactId: string,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  const hasVerifyingTestCase = graph.incoming(artifactId, "verifies").some((edge) => {
    const source = graph.get(edge.from);
    return source && registry.has(source.type) && registry.satisfies(source.type, "TestCase");
  });
  if (hasVerifyingTestCase) return [];

  return [
    {
      rule: "chain/bug-regression",
      severity: resolveSeverity("chain/bug-regression", context),
      artifact: artifactId,
      subject: "verifies",
      message: `Bug "${artifactId}" has no verifies-Bug TestCase (ST-009)`,
    },
  ];
}

/** `docs/todo-marker` (warn) — unresolved `TODO(ibos)` markers in an
 * artifact's body. One finding per occurrence. */
export function checkTodoMarker(artifactId: string, body: string, context?: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of body.matchAll(/TODO\(ibos\)[^\n]*/g)) {
    const marker = match[0].trim();
    findings.push({
      rule: "docs/todo-marker",
      severity: resolveSeverity("docs/todo-marker", context),
      artifact: artifactId,
      subject: marker,
      message: `unresolved marker: ${marker}`,
    });
  }
  return findings;
}
