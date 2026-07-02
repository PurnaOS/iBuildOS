// Stable JSON encoding for the graph. Unlike Go's encoding/json, JS
// JSON.stringify does NOT sort object keys — so we pass a replacer that sorts
// every object's keys recursively (arrays keep their already-sorted order). This
// keeps the `fields` map and the whole document byte-stable across runs/OSes.
import type { Graph } from "./graph.ts";

function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) sorted[k] = o[k];
    return sorted;
  }
  return value;
}

// stableJSON renders the graph as deterministic, indented JSON + trailing newline.
export function stableJSON(g: Graph): string {
  return JSON.stringify(g, sortKeysReplacer, 2) + "\n";
}

// stableStringify is the generic form, reused by other deterministic JSON outputs.
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, sortKeysReplacer, 2) + "\n";
}
