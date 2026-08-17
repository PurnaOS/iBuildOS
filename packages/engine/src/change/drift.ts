import { resolveSeverity, type Finding } from "@ibuildos/schemas";
import type { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, baseArtifactId, isRecord } from "../graph/graph.js";

// SPEC.md area M, CH-008 — deterministic drift detection: divergence the graph alone can
// prove, with no semantic judgment (that's RQ-012's on-demand agent review, and CH-010's
// implementation-conformance audit — both explicitly out of scope here; they need a real
// reviewer-role agent session, not this deterministic package). CH-008's text names three
// signals: "code referencing retired requirements, tests verifying superseded criteria,
// stories whose requirement moved". The shipped profile (docs/profile/*.md) models a
// dependent as linking *up* to what it concerns (Story.implements -> Requirement,
// TestCase.verifies -> Requirement|Story|Bug) — so the first two collapse into one
// structural check: something not itself retired still points at something that is
// retired, or superseded (the target of another artifact's `supersedes` link). The third
// needs the CH-002 process check too: built work against a moved requirement, with no
// Change artifact recording it.
//
// Both rule IDs below are new — not yet in FORMATS.md §6's printed table.
// `defaultSeverity: "warn"` follows rule-registry.ts's own documented-assumption
// convention (informational drift, same tier as `chain/req-unimplemented` and
// `guidance/stale`) until a project's `docs/profile/gates.yaml` binds either into a gate
// at a stricter tier.

function supersededTargetIds(graph: ArtifactGraph): Set<string> {
  return new Set(graph.edgesByRelationship("supersedes").map((e) => e.targetId));
}

/** Every artifact ID named in some Change's `links.affects` — i.e. every artifact whose
 * evolution has actually been recorded per CH-002. */
function recordedChangeTargets(graph: ArtifactGraph, registry: ProfileRegistry): Set<string> {
  const targets = new Set<string>();
  for (const artifact of graph.allArtifacts()) {
    if (!registry.has(artifact.type) || !registry.satisfies(artifact.type, "Change")) continue;
    const links = artifact.frontmatter.links;
    const affects = isRecord(links) ? links.affects : undefined;
    if (!Array.isArray(affects)) continue;
    for (const target of affects) {
      if (typeof target === "string") targets.add(baseArtifactId(target));
    }
  }
  return targets;
}

/** `drift/retired-referenced` (warn) — a non-retired artifact still links to something
 * that is itself retired, or superseded (the target of another artifact's `supersedes`
 * link). One finding per (referencer, target) pair. Direct links only, deliberately not
 * a transitive walk: the shipped profile already models `verifies`/`implements` as
 * direct edges to the Requirement they concern, so the named cases (a TestCase still
 * verifying a retired Requirement, a Story still implementing a superseded one) are one
 * hop away. The `supersedes` edge itself is excluded from "referencer" edges: the newer
 * Requirement declaring `supersedes: [old]` is the correct record that it moved, not
 * drift — flagging it would make recording a supersession trip its own detector. */
export function checkRetiredReferenced(graph: ArtifactGraph, context?: string): Finding[] {
  const superseded = supersededTargetIds(graph);
  const findings: Finding[] = [];

  for (const artifact of graph.allArtifacts()) {
    const isRetired = artifact.frontmatter.state === "retired";
    const isSuperseded = superseded.has(artifact.id);
    if (!isRetired && !isSuperseded) continue;

    const referencerIds = new Set(
      graph
        .incoming(artifact.id)
        .filter((edge) => edge.relationship !== "supersedes")
        .map((edge) => edge.from),
    );

    for (const fromId of [...referencerIds].sort()) {
      const referencer = graph.get(fromId);
      if (!referencer || referencer.frontmatter.state === "retired") continue;

      findings.push({
        rule: "drift/retired-referenced",
        severity: resolveSeverity("drift/retired-referenced", context),
        artifact: fromId,
        subject: artifact.id,
        message: `"${fromId}" still links to "${artifact.id}", which is ${
          isRetired ? "retired" : "superseded"
        }`,
      });
    }
  }

  return findings.sort(
    (a, b) => a.artifact.localeCompare(b.artifact) || a.subject.localeCompare(b.subject),
  );
}

/** `drift/unrecorded-change` (warn) — a `done`/`accepted` WorkItem-satisfying artifact
 * whose `implements` target has since been retired or superseded, with no Change
 * artifact (CH-002) recording it against either the work item or the requirement. Built
 * work quietly resting on a moved requirement (CH-008's "stories whose requirement
 * moved") — surfaced as a finding rather than left as silent rot (CH-005). */
export function checkUnrecordedChange(
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  const superseded = supersededTargetIds(graph);
  const recorded = recordedChangeTargets(graph, registry);
  const findings: Finding[] = [];

  for (const artifact of graph.allArtifacts()) {
    if (!registry.has(artifact.type) || !registry.satisfies(artifact.type, "WorkItem")) continue;
    const state = artifact.frontmatter.state;
    if (state !== "done" && state !== "accepted") continue;

    for (const edge of graph.outgoing(artifact.id, "implements")) {
      const requirement = graph.get(edge.targetId);
      if (!requirement) continue;

      const isRetired = requirement.frontmatter.state === "retired";
      const isSuperseded = superseded.has(requirement.id);
      if (!isRetired && !isSuperseded) continue;
      if (recorded.has(artifact.id) || recorded.has(requirement.id)) continue;

      findings.push({
        rule: "drift/unrecorded-change",
        severity: resolveSeverity("drift/unrecorded-change", context),
        artifact: artifact.id,
        subject: requirement.id,
        message: `"${artifact.id}" is "${state}" against requirement "${requirement.id}", which has since been ${
          isRetired ? "retired" : "superseded"
        }, with no recorded Change linking either`,
      });
    }
  }

  return findings.sort(
    (a, b) => a.artifact.localeCompare(b.artifact) || a.subject.localeCompare(b.subject),
  );
}
