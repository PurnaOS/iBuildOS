import type { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, baseArtifactId, type GraphArtifact } from "../graph/graph.js";
import { compareStrings, sortedUnique } from "./shared.js";

// IN-002/TD-006 — coverage by traceability: which Requirements/Stories (and
// anything else a TestCase can verify) have passing `verified_by` evidence
// and which don't, built on `ArtifactGraph.outgoing`/`incoming` rather than
// re-walking `links` by hand.
//
// "Passing" here is deliberately kept in sync with the existing gate rule
// `chain/story-untested` (packages/engine/src/rules/chain.ts): a TestCase is
// covered iff *some* TestResult anywhere in the bundle has `subject` pointing
// at it and `verdict === "pass"` — no "latest result wins" tie-break, no
// staleness check (that's `evid/stale`'s separate concern). If that gate's
// semantics change, this should change with it.

const TEST_RESULT_TYPE = "TestResult";

/** Is this artifact a TestResult? With a registry, the real is-or-extends
 * check; without one, duck-type on TestResult's own two required fields
 * (`docs/profile/test-result.md`: `subject` id, `verdict` enum) — the same
 * KB-008-style tolerance `ArtifactGraph` itself uses, so callers that don't
 * have a loaded profile handy (e.g. most tests) still get correct behavior. */
function isTestResult(artifact: GraphArtifact, registry?: ProfileRegistry): boolean {
  if (registry) return registry.has(artifact.type) && registry.satisfies(artifact.type, TEST_RESULT_TYPE);
  return typeof artifact.frontmatter.subject === "string" && typeof artifact.frontmatter.verdict === "string";
}

/** Every TestCase verifying `id`, from both directions the default profile
 * allows: `id --verified_by--> TestCase` (Story/Task own the link,
 * `docs/profile/story.md`/`task.md`) and `TestCase --verifies--> id`
 * (`docs/profile/test-case.md`, targets Requirement/Story/Bug). A
 * Requirement never carries `verified_by` itself
 * (`docs/profile/requirement.md` declares no such link), so the incoming
 * `verifies` edge is the *only* path from a Requirement to its tests — and
 * TD-006 explicitly asks for requirement coverage, not just story coverage.
 * `graph.incoming`/`outgoing` already strip a criterion ref (`ID#AC-n`) down
 * to the base artifact ID, so per-criterion `verifies` links roll up into
 * the parent artifact's coverage for free; per-criterion granularity itself
 * is out of scope here. IDs are normalized (`baseArtifactId`/graph lookups
 * already uppercase) so a caller passing a lowercase id still resolves. */
export function verifyingTestCaseIds(graph: ArtifactGraph, id: string): string[] {
  const out = graph.outgoing(id, "verified_by").map((e) => e.targetId);
  const inn = graph.incoming(id, "verifies").map((e) => e.from);
  return sortedUnique([...out, ...inn]);
}

export interface TestCaseEvidence {
  testCaseId: string;
  /** At least one TestResult recorded against this TestCase, any verdict. */
  hasResult: boolean;
  /** At least one recorded TestResult has `verdict === "pass"`. */
  hasPassingResult: boolean;
}

/** One pass over every TestResult-like artifact in the bundle, keyed by the
 * TestCase it targets (`subject`, base-ID-normalized). Built once and reused
 * across every artifact `coverageMatrix` scores, instead of the O(ids x
 * artifacts) rescan a naive per-artifact lookup would do. */
function buildTestResultIndex(
  graph: ArtifactGraph,
  registry?: ProfileRegistry,
): Map<string, { hasResult: boolean; hasPassingResult: boolean }> {
  const index = new Map<string, { hasResult: boolean; hasPassingResult: boolean }>();
  for (const artifact of graph.allArtifacts()) {
    if (!isTestResult(artifact, registry)) continue;
    const subject = artifact.frontmatter.subject;
    if (typeof subject !== "string") continue;
    const testCaseId = baseArtifactId(subject);
    const entry = index.get(testCaseId) ?? { hasResult: false, hasPassingResult: false };
    entry.hasResult = true;
    if (artifact.frontmatter.verdict === "pass") entry.hasPassingResult = true;
    index.set(testCaseId, entry);
  }
  return index;
}

export type CoverageStatus = "covered" | "failing" | "missing-result" | "uncovered";

export interface CoverageEntry {
  artifactId: string;
  /** Sorted, deduped TestCase IDs from `verifyingTestCaseIds`. */
  testCaseIds: string[];
  evidence: TestCaseEvidence[];
  status: CoverageStatus;
}

function entryFromIndex(
  graph: ArtifactGraph,
  id: string,
  index: Map<string, { hasResult: boolean; hasPassingResult: boolean }>,
): CoverageEntry {
  const testCaseIds = verifyingTestCaseIds(graph, id);
  const evidence: TestCaseEvidence[] = testCaseIds.map((testCaseId) => {
    const found = index.get(testCaseId);
    return { testCaseId, hasResult: found?.hasResult ?? false, hasPassingResult: found?.hasPassingResult ?? false };
  });

  let status: CoverageStatus;
  if (testCaseIds.length === 0) status = "uncovered";
  else if (evidence.some((e) => e.hasPassingResult)) status = "covered";
  else if (evidence.some((e) => e.hasResult)) status = "failing";
  else status = "missing-result";

  return { artifactId: baseArtifactId(id), testCaseIds, evidence, status };
}

/** Coverage for one artifact. `status`:
 * - `"uncovered"` — no TestCase verifies it at all.
 * - `"missing-result"` — TestCase(s) linked, but none has any TestResult yet.
 * - `"failing"` — TestCase(s) have results, but none is passing.
 * - `"covered"` — at least one linked TestCase has a passing TestResult —
 *   exactly `chain/story-untested`'s gate condition, generalized to any
 *   verified artifact and enriched with the finer-grained states above.
 *
 * Scores one artifact; for a whole matrix use `coverageMatrix`, which builds
 * the TestResult index once instead of once per artifact. */
export function coverageFor(graph: ArtifactGraph, id: string, registry?: ProfileRegistry): CoverageEntry {
  return entryFromIndex(graph, id, buildTestResultIndex(graph, registry));
}

/** `coverageFor` over a set of artifact IDs (e.g. every Requirement + Story
 * ID, gathered by the caller via `idsSatisfying`/`artifactsSatisfying`),
 * normalized, deduped, and sorted by artifact ID. Builds the TestResult
 * index once and reuses it across every artifact, rather than rescanning
 * the whole bundle per artifact. */
export function coverageMatrix(
  graph: ArtifactGraph,
  ids: readonly string[],
  registry?: ProfileRegistry,
): CoverageEntry[] {
  const index = buildTestResultIndex(graph, registry);
  const normalizedIds = sortedUnique(ids.map((id) => baseArtifactId(id)));
  return normalizedIds.map((id) => entryFromIndex(graph, id, index));
}
