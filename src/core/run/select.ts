// Ready-queue derivation for `iBuild run` (AG-012). Pure: Graph + Registry +
// Config in, ordered ReadyTask list out. Capability predicates only — "task-like"
// = declares the chain code field, "requirement" = is-or-extends a target of the
// implements relationship — so NO taxonomy literal appears here (same discipline
// as validate/complete.ts). Ordering is deterministic: priority rank from the
// type's own one_of vocabulary (data), then graph key.
import type { Config } from "../config/config.ts";
import type { Graph, GraphNode } from "../graphx/graph.ts";
import type { Registry } from "../types/registry.ts";

export interface ReadyTask {
  key: string; // canonical /root-relative graph key
  path: string; // bundle-relative path (findings style)
  id: string; // the artifact's id field, "" when absent
  title: string;
  rank: number; // priority one_of index; unranked sorts last
}

function fieldStr(n: GraphNode, key: string): string {
  const v = n.fields?.[key];
  return typeof v === "string" ? v : "";
}

// selectReady returns every claimable task, best-first: task-like type, ready
// status, and traced to an ACTIVE requirement (directly via implements, or
// through a parent that implements one). Draft/proposed backlogs yield an empty
// queue — flipping a requirement to an active status is the human scheduling
// act that opens work to the executor.
export function selectReady(graph: Graph, reg: Registry, cfg: Config): ReadyTask[] {
  const ch = cfg.chain;
  const reqTypes = reg.relTargets(ch.implementsRel);
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));

  const implementsActive = (key: string): boolean => {
    for (const e of graph.edges) {
      if (e.from !== key || e.relationship !== ch.implementsRel || !e.resolved) continue;
      const t = byKey.get(e.to);
      if (!t) continue;
      if (reg.satisfiesAny(t.type, reqTypes) && t.status !== undefined && ch.activeReqStatuses.includes(t.status)) return true;
    }
    return false;
  };

  const out: ReadyTask[] = [];
  for (const n of graph.nodes) {
    const res = reg.resolve(n.type);
    if (!res || res.abstract || !res.fields.has(ch.codeField)) continue; // not task-like
    if (n.status === undefined || !ch.readyStatuses.includes(n.status)) continue; // not ready (claimed/blocked/done aren't)

    let traced = implementsActive(n.key);
    if (!traced) {
      for (const e of graph.edges) {
        if (e.from !== n.key || e.relationship !== ch.parentRel || !e.resolved) continue;
        if (implementsActive(e.to)) {
          traced = true;
          break;
        }
      }
    }
    if (!traced) continue;

    const vocab = res.fields.get(cfg.run.priorityField)?.oneOf ?? [];
    const idx = vocab.indexOf(fieldStr(n, cfg.run.priorityField));
    out.push({
      key: n.key,
      path: n.path,
      id: fieldStr(n, "id"),
      title: fieldStr(n, "title"),
      rank: idx >= 0 ? idx : Number.MAX_SAFE_INTEGER,
    });
  }

  out.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

// findTask resolves a --task ref (graph key or artifact id) to a claimable-shaped
// entry regardless of readiness — the human pinned it, so only shape (task-like)
// is enforced; null when it doesn't exist or isn't task-like.
export function findTask(graph: Graph, reg: Registry, cfg: Config, ref: string): ReadyTask | null {
  for (const n of graph.nodes) {
    if (n.key !== ref && fieldStr(n, "id") !== ref) continue;
    const res = reg.resolve(n.type);
    if (!res || res.abstract || !res.fields.has(cfg.chain.codeField)) return null;
    return { key: n.key, path: n.path, id: fieldStr(n, "id"), title: fieldStr(n, "title"), rank: 0 };
  }
  return null;
}
