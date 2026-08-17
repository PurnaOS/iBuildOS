import type { ProfileRegistry } from "../profile/registry.js";

// SPEC TM-007 — handoffs. Profile-defined transitions may designate a
// next-responsible user/team/role ("ready for acceptance → PM"). The
// mapping itself is caller-supplied plain data: parsing `docs/profile/*.md`
// is `ProfileRegistry`'s job (CLAUDE.md non-negotiable #4 — process is
// data, not app logic baked into a new module), so this file never touches
// the filesystem. When a `ProfileRegistry` is supplied, a transition is
// only honored if it's actually legal per the type's own
// `states.transitions` (FORMATS §5) — mirrors what rule `state/legal`
// considers a transition to be.

export interface HandoffTarget {
  role?: string;
  /** A `US-…` id. */
  user?: string;
  /** A `TM-…` id. */
  team?: string;
}

/** One handoff rule for a type. `from` uses the same grammar as a
 * TypeDefinition transition (`states.transitions[].from`): a single state,
 * a list of states, or `"*"`. */
export interface HandoffRule {
  from: string | string[];
  to: string;
  handoffTo: HandoffTarget;
}

/** Profile-defined handoff mapping, keyed by type name. */
export type HandoffMapping = Record<string, HandoffRule[]>;

function matchesFrom(from: string | string[], state: string): boolean {
  if (from === "*") return true;
  if (Array.isArray(from)) return from.includes(state);
  return from === state;
}

/**
 * Resolve the next-responsible user/team/role for a `typeName` artifact's
 * `from -> to` state transition (TM-007), per `mapping`. Pass `registry` to
 * additionally require that the transition itself is legal per the type's
 * declared `states.transitions` — an illegal transition never produces a
 * handoff, regardless of what `mapping` says. Returns `undefined` when no
 * rule matches: most transitions have none (SPEC's "may designate" —
 * handoffs are opt-in), so "no handoff" is the common case, not an error.
 */
export function resolveHandoff(
  mapping: HandoffMapping,
  typeName: string,
  from: string,
  to: string,
  registry?: ProfileRegistry,
): HandoffTarget | undefined {
  if (registry) {
    const transitions = registry.resolve(typeName).states?.transitions ?? [];
    const legal = transitions.some((t) => matchesFrom(t.from, from) && t.to === to);
    if (!legal) return undefined;
  }

  const rule = (mapping[typeName] ?? []).find((r) => matchesFrom(r.from, from) && r.to === to);
  return rule?.handoffTo;
}
