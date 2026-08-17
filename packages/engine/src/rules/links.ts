import { resolveSeverity, type Finding } from "@ibuildos/schemas";
import type { ProfileRegistry, ResolvedType } from "../profile/registry.js";
import { ArtifactGraph, baseArtifactId, isRecord } from "../graph/graph.js";
import { findCycles } from "../graph/queries.js";

// FORMATS.md §6 — the link/* rule family. Each rule reads an artifact's own
// `frontmatter.links` block; the graph is only needed by the two rules that
// must reason about *other* artifacts (target-type, cycles).

function linksOf(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return isRecord(frontmatter.links) ? frontmatter.links : {};
}

/** `link/target-exists` — every ID in every `links:` entry must resolve to
 * an artifact present in the bundle. Handles criterion refs (`ID#AC-n`) by
 * resolving the base artifact ID, not the whole string — a criterion ref
 * whose target artifact exists is not "dangling" even though the exact
 * string never equals a bare artifact ID (checking that the referenced
 * criterion number itself exists is out of scope: that needs the target
 * artifact's parsed body, which this rule doesn't have). */
export function checkLinkTargetExists(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  graph: ArtifactGraph,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [relationship, rawTargets] of Object.entries(linksOf(frontmatter))) {
    if (!Array.isArray(rawTargets)) continue;
    for (const target of rawTargets) {
      if (typeof target !== "string") continue;
      if (!graph.has(baseArtifactId(target))) {
        findings.push({
          rule: "link/target-exists",
          severity: resolveSeverity("link/target-exists", context),
          artifact: artifactId,
          subject: relationship,
          message: `${target} does not exist`,
        });
      }
    }
  }
  return findings;
}

/** `link/target-type` — every link target's type must satisfy (is-or-extends)
 * one of the relationship's declared `target` types (FORMATS §5 polymorphic
 * targets). Dangling targets are `link/target-exists`'s concern; targets
 * whose own type is unknown to the registry are tolerated (KB-008) rather
 * than flagged here. */
export function checkLinkTargetType(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [relationship, rawTargets] of Object.entries(linksOf(frontmatter))) {
    const linkDef = type.links[relationship];
    if (!linkDef) continue; // undeclared relationship — not this rule's concern
    if (!Array.isArray(rawTargets)) continue;

    for (const target of rawTargets) {
      if (typeof target !== "string") continue;
      const targetArtifact = graph.get(baseArtifactId(target));
      if (!targetArtifact) continue; // dangling — link/target-exists' concern
      if (!registry.has(targetArtifact.type)) continue; // unknown type tolerated (KB-008)

      const ok = linkDef.target.some(
        (candidate) => registry.has(candidate) && registry.satisfies(targetArtifact.type, candidate),
      );
      if (!ok) {
        findings.push({
          rule: "link/target-type",
          severity: resolveSeverity("link/target-type", context),
          artifact: artifactId,
          subject: relationship,
          message: `${target} is type "${targetArtifact.type}", expected one of [${linkDef.target.join(", ")}]`,
        });
      }
    }
  }
  return findings;
}

/** `link/cardinality` — a relationship's entry count must respect the
 * type's declared `min`/`max`. An absent `links` key counts as zero
 * entries, same as an empty array. */
export function checkLinkCardinality(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  const links = linksOf(frontmatter);

  for (const [relationship, def] of Object.entries(type.links)) {
    const raw = links[relationship];
    const count = Array.isArray(raw) ? raw.length : 0;

    if (def.min !== undefined && count < def.min) {
      findings.push({
        rule: "link/cardinality",
        severity: resolveSeverity("link/cardinality", context),
        artifact: artifactId,
        subject: relationship,
        message: `link "${relationship}" requires at least ${def.min} target(s), found ${count}`,
      });
    }
    if (def.max !== undefined && count > def.max) {
      findings.push({
        rule: "link/cardinality",
        severity: resolveSeverity("link/cardinality", context),
        artifact: artifactId,
        subject: relationship,
        message: `link "${relationship}" allows at most ${def.max} target(s), found ${count}`,
      });
    }
  }
  return findings;
}

/** `link/cycles` — every relationship declaring `cycles: forbid` (on any
 * type loaded in the registry) must be acyclic across the whole bundle.
 * Bundle-wide, not per-artifact: call once per validation pass, not once per
 * artifact. Emits one finding per cycle (strongly-connected component), not
 * one per edge — `artifact` is the lexicographically smallest member of the
 * cycle so the finding is stable regardless of traversal order. */
export function checkLinkCycles(
  graph: ArtifactGraph,
  registry: ProfileRegistry,
  context?: string,
): Finding[] {
  const forbidden = new Set<string>();
  for (const artifact of graph.allArtifacts()) {
    if (!registry.has(artifact.type)) continue;
    const resolved = registry.resolve(artifact.type);
    for (const [relationship, def] of Object.entries(resolved.links)) {
      if (def.cycles === "forbid") forbidden.add(relationship);
    }
  }

  const findings: Finding[] = [];
  for (const relationship of [...forbidden].sort()) {
    for (const cycle of findCycles(graph, relationship)) {
      findings.push({
        rule: "link/cycles",
        severity: resolveSeverity("link/cycles", context),
        artifact: cycle[0]!,
        subject: relationship,
        message: `cycle in "${relationship}": ${cycle.join(" -> ")} -> ${cycle[0]}`,
      });
    }
  }
  return findings;
}
