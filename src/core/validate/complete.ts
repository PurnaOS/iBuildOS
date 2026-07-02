// The orphan / chain completeness rules for Requirement -> Task -> Code -> Test.
// Capability predicates are derived from the type graph (e.g. "is a requirement"
// = is-or-extends the target of the `implements` relationship) so NO type-name
// literal appears here. Port of Go internal/validate/complete.go.
import type { ChainConfig, Config } from "../config/config.ts";
import { Collector } from "../model/model.ts";
import type { Registry } from "../types/registry.ts";
import { type Artifact, type RLink, contains, idOrPath } from "./validate.ts";
import type { Graph } from "./graph.ts";
import { scalarListField } from "./code.ts";

export function completeness(arts: Artifact[], g: Graph, reg: Registry, cfg: Config, c: Collector): void {
  const ch = cfg.chain;
  const reqTypes = reg.relTargets(ch.implementsRel);
  const isRequirement = (t: string): boolean => reg.satisfiesAny(t, reqTypes);

  for (const a of arts) {
    if (a.typ === "") continue;
    const res = reg.resolve(a.typ);
    if (!res || res.abstract) continue;

    const reqLike = isRequirement(a.typ);
    const taskLike = res.fields.has(ch.codeField);

    if (reqLike) {
      const implemented = (g.implementersOf.get(a.rootRel)?.length ?? 0) > 0;
      const verified = (g.verifiersOf.get(a.rootRel)?.length ?? 0) > 0;
      if (contains(ch.activeReqStatuses, a.status)) {
        if (!implemented) {
          c.errf(a.path, a.doc!.frontStartLine(), "chain.reqNotImplemented",
            `requirement ${q(idOrPath(a))} is ${q(a.status)} but nothing implements it (no Story, Epic, or Task links to it)`);
        }
        if (!verified) {
          c.errf(a.path, a.doc!.frontStartLine(), "chain.reqNoTest",
            `requirement ${q(idOrPath(a))} is ${q(a.status)} but no test verifies it`);
        }
      } else if (contains(ch.proposedStatuses, a.status)) {
        if (!implemented) {
          c.warnf(a.path, a.doc!.frontStartLine(), "chain.proposedReqUnimplemented",
            `proposed requirement ${q(idOrPath(a))} has nothing implementing it yet`);
        }
      }
    }

    // Done-task rules apply to any "task-like" type: one that declares the code field.
    if (taskLike && contains(ch.doneStatuses, a.status)) {
      checkDoneTask(a, g, reg, cfg, c);
    }

    // Flag a status that differs from a configured chain status only by case /
    // whitespace (a typo that silently bypasses the case-sensitive rules above).
    if (a.status !== "" && (reqLike || taskLike) && miscasedChainStatus(ch, reqLike, taskLike, a.status)) {
      c.warnf(a.path, a.doc!.frontStartLine(), "chain.unrecognizedStatus",
        `${q(idOrPath(a))} has status ${q(a.status)}, which differs only by case/whitespace from a configured chain status; status matching is case-sensitive, so the chain status rules were not applied`);
    }
  }
}

function miscasedChainStatus(ch: ChainConfig, reqLike: boolean, taskLike: boolean, status: string): boolean {
  const vocab: string[] = [];
  if (reqLike) vocab.push(...ch.activeReqStatuses, ...ch.proposedStatuses);
  if (taskLike) vocab.push(...ch.doneStatuses);
  for (const v of vocab) if (v === status) return false; // exact match — recognized
  const norm = status.trim().toLowerCase();
  for (const v of vocab) if (v.trim().toLowerCase() === norm) return true; // case/whitespace-only difference
  return false;
}

function checkDoneTask(a: Artifact, g: Graph, reg: Registry, cfg: Config, c: Collector): void {
  const ch = cfg.chain;
  const line = a.doc!.frontStartLine();

  if (scalarListField(a, ch.codeField).length === 0) {
    c.errf(a.path, line, "chain.doneTaskNoCode", `task ${q(idOrPath(a))} is done but declares no code globs`);
  }

  const vb = a.links[ch.verifiedByRel] ?? [];
  if (vb.length === 0) {
    c.errf(a.path, line, "chain.doneTaskTestNotPassing", `task ${q(idOrPath(a))} is done but no test verifies it`);
  } else {
    for (const rl of vb) {
      if (!rl.exists) continue; // already reported as link.unresolved
      const t = g.byKey.get(rl.key);
      const st = t ? t.status : "unknown";
      if (!t || !contains(ch.passingStatuses, st)) {
        c.errf(a.path, line, "chain.doneTaskTestNotPassing",
          `task ${q(idOrPath(a))} is done but test ${q(rl.raw)} is ${q(st)} (expected passing)`);
      }
    }
  }

  // Traceability: must implement a requirement directly, or via a parent that does.
  const reqTypes = reg.relTargets(ch.implementsRel);
  const implementsReq = (links: RLink[]): boolean =>
    links.some((rl) => rl.exists && reg.satisfiesAny(rl.targetType, reqTypes));
  const direct = implementsReq(a.links[ch.implementsRel] ?? []);
  let viaParent = false;
  let parentUnresolved = false;
  for (const rl of a.links[ch.parentRel] ?? []) {
    if (!rl.exists) {
      parentUnresolved = true;
      continue;
    }
    const p = g.byKey.get(rl.key);
    if (p && implementsReq(p.links[ch.implementsRel] ?? [])) viaParent = true;
  }
  if (!direct && !viaParent) {
    if (parentUnresolved) {
      c.errf(a.path, line, "chain.doneTaskParentUnresolved",
        `task ${q(idOrPath(a))} is done and traces only through a parent link that does not resolve to an existing document`);
    } else {
      c.errf(a.path, line, "chain.doneTaskUntraced",
        `task ${q(idOrPath(a))} is done but neither implements a requirement directly nor has a parent that does`);
    }
  }
}

function q(s: string): string {
  return JSON.stringify(s);
}
