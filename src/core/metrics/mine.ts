// Personal queue (PM-007): everything on one contributor's plate — work they own
// (the `owner` field) plus work assigned to them (the `assignee` relationship,
// resolved to a User artifact whose git identity matches). Derived from the
// graph, not hand-maintained.
import type { Graph } from "../graphx/graph.ts";

export interface Mine {
  version: string;
  generator: string;
  identity: string;
  owned: string[];
  assigned: string[];
}

// userKeysFor finds identity-artifact keys whose identity matches: a node whose
// id, git_email, or handle equals the identity. Data-driven — it checks generic
// frontmatter fields, never a hardcoded identity type name.
function userKeysFor(graph: Graph, identity: string): Set<string> {
  const keys = new Set<string>();
  for (const n of graph.nodes) {
    const f = n.fields ?? {};
    if ([f.id, f.git_email, f.handle].some((v) => typeof v === "string" && v === identity)) keys.add(n.key);
  }
  return keys;
}

export function buildMine(graph: Graph, identity: string): Mine {
  const owned: string[] = [];
  for (const n of graph.nodes) {
    if (typeof n.fields?.owner === "string" && n.fields.owner === identity) owned.push(n.key);
  }

  const userKeys = userKeysFor(graph, identity);
  const assigned: string[] = [];
  if (userKeys.size > 0) {
    const assigneeRel = "assignee"; // the §9 assignment relationship name
    for (const e of graph.edges) {
      if (e.relationship === assigneeRel && e.resolved && userKeys.has(e.to)) assigned.push(e.from);
    }
  }

  return {
    version: "1",
    generator: "iBuild mine",
    identity,
    owned: [...new Set(owned)].sort(),
    assigned: [...new Set(assigned)].sort(),
  };
}
