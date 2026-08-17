import { ClaimSchema, resolveSeverity, type Finding } from "@ibuildos/schemas";

// FORMATS.md §6 — checker functions for the `merge/*` rule family. Both rule
// IDs are already registered in `@ibuildos/schemas`' `RULE_REGISTRY` (warn
// default, error under the `merge` gate context) but had no implementation
// yet. These are merge-queue concerns (SPEC.md area IG): the merge queue
// (`../streams/merge-queue.ts`) calls them directly at landing time, rather
// than through the bundle-wide rule engine (`./engine.ts`) that
// `validate`/`gates` drive — landing-time facts (a stream's own claim, which
// other streams are currently in flight) aren't things the general
// document/graph rule engine has any way to see.

/** Mirrors `ClaimSchema` (`@ibuildos/schemas`). Duplicated locally (rather
 * than importing a `Claim` type export that doesn't exist yet) since this
 * module only needs the shape, not the runtime schema, for its own
 * comparison logic. */
export interface Claim {
  by: string;
  machine: string;
  at: string;
}

/**
 * `merge/superseded` (warn; error@merge) — BD-017: a stream's assigned
 * story must not already be `done` on trunk, and must not carry a `claim`
 * written by a different machine *after* this stream's own claim (meaning
 * someone else re-claimed and already landed the same story while this
 * stream was in flight).
 *
 * `trunkFrontmatter` is the story's frontmatter as currently committed on
 * trunk (`undefined` if the story doesn't exist there yet — nothing to be
 * superseded by). `streamClaim` is this stream's own claim (read via
 * `../streams/worktree.ts`'s `readClaim` from the stream's own worktree
 * copy). Resolving "what's on trunk" and gathering these two values is the
 * merge queue's job — this function is a pure comparison over already-read
 * data, matching the rest of this package's rule-checker shape.
 */
export function checkMergeSuperseded(
  storyId: string,
  trunkFrontmatter: Record<string, unknown> | undefined,
  streamClaim: Claim | undefined,
  context?: string,
): Finding[] {
  if (!trunkFrontmatter) return [];
  const severity = resolveSeverity("merge/superseded", context);

  if (trunkFrontmatter.state === "done") {
    return [
      {
        rule: "merge/superseded",
        severity,
        artifact: storyId,
        subject: "state",
        message: `story "${storyId}" is already "done" on trunk — this stream's work has been superseded`,
      },
    ];
  }

  const trunkClaim = ClaimSchema.safeParse(trunkFrontmatter.claim);
  if (
    trunkClaim.success &&
    streamClaim !== undefined &&
    trunkClaim.data.machine !== streamClaim.machine &&
    trunkClaim.data.at > streamClaim.at
  ) {
    return [
      {
        rule: "merge/superseded",
        severity,
        artifact: storyId,
        subject: "claim",
        message: `story "${storyId}" was claimed by machine "${trunkClaim.data.machine}" at ${trunkClaim.data.at}, after this stream's own claim at ${streamClaim.at} — a different stream may already be landing it`,
      },
    ];
  }

  return [];
}

/**
 * One resource an in-flight stream declares it touches — shaped after
 * `rules/contract.ts`'s `OrderedResourceSchema`-adjacent contract types
 * (`{component, name}`, where `name` matches `OrderedResourceSchema.name`;
 * `paths`/`command` don't matter for collision purposes, only identity
 * does).
 */
export interface OrderedResourceTouch {
  component: string;
  name: string;
}

/** One other stream currently in flight through the merge queue, and the
 * ordered resources it declared. */
export interface InFlightStream {
  streamId: string;
  resources: readonly OrderedResourceTouch[];
}

function sameResource(a: OrderedResourceTouch, b: OrderedResourceTouch): boolean {
  return a.component === b.component && a.name === b.name;
}

/**
 * `merge/ordered-resource` (warn; error@merge) — IG-011: two streams
 * declaring the same ordered resource (a DB migration, sequenced codegen,
 * …) must not land concurrently. Given the resources *this* stream touches
 * and the set of other streams currently in flight (each with their own
 * declared resources), flags a collision for every shared resource so the
 * merge queue can refuse to land this one until the collision clears.
 * `inFlight` is expected to already exclude the stream being checked.
 */
export function checkMergeOrderedResource(
  streamId: string,
  streamResources: readonly OrderedResourceTouch[],
  inFlight: readonly InFlightStream[],
  context?: string,
): Finding[] {
  const severity = resolveSeverity("merge/ordered-resource", context);
  const findings: Finding[] = [];

  for (const resource of streamResources) {
    for (const other of inFlight) {
      if (other.streamId === streamId) continue;
      if (other.resources.some((r) => sameResource(r, resource))) {
        findings.push({
          rule: "merge/ordered-resource",
          severity,
          artifact: streamId,
          subject: `${resource.component}.${resource.name}`,
          message: `ordered resource "${resource.name}" (component "${resource.component}") is already in flight via stream "${other.streamId}" — must serialize through the merge queue (IG-011)`,
        });
      }
    }
  }

  return findings;
}
