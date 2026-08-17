// Internal helpers shared across the insights/* modules. Not part of the
// package's public surface (not re-exported from ./index.ts) — every
// dashboard query below imports these directly.

/** Locale-independent string comparator — plain code-unit order. Mirrors
 * `packages/engine/src/baseline/baseline.ts`'s own `compareStrings`: never
 * `localeCompare` here, since locale-aware ordering isn't guaranteed stable
 * across the ubuntu/macos CI matrix this engine is held to. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Dedupe + sort a list of IDs deterministically. */
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}
