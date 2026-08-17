import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadBundle } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { EXIT_CLEAN, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface EdgeRow {
  artifact: string;
  relationship: string;
  target: string;
}

function edgeRows(bundle: ReturnType<typeof loadBundle>): EdgeRow[] {
  const rows = bundle.graph
    .allArtifacts()
    .flatMap((a) =>
      bundle.graph.outgoing(a.id).map((e) => ({ artifact: e.from, relationship: e.relationship, target: e.targetId })),
    );
  return rows.sort(
    (a, b) =>
      compareStrings(a.artifact, b.artifact) ||
      compareStrings(a.relationship, b.relationship) ||
      compareStrings(a.target, b.target),
  );
}

/** `ibuildos graph export [--format json] | matrix [--format json|csv]`
 * (FORMATS §12). Deliberately generic (no hardcoded type names, per
 * CLAUDE.md's "self-describing process" stance) — `matrix` is a flat
 * artifact/relationship/target edge list rather than a Requirement-specific
 * RTM, since FORMATS doesn't pin a schema for either output and the graph
 * itself carries no notion of which relationship names are "the" traceability
 * chain (that's data in docs/profile/*.md's `links:` blocks, per type). */
export async function runGraph(args: string[], env: CommandEnv): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      format: { type: "string" },
      root: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  const sub = positionals[0];
  if (sub !== "export" && sub !== "matrix") {
    throw new UsageError(`graph requires "export" or "matrix", got ${sub ? `"${sub}"` : "nothing"}`);
  }

  const config = loadConfig(env.cwd);
  const bundleRoot = resolve(env.cwd, values.root ?? config?.bundle.root ?? "docs");
  const profileDir = resolveProfileDir(env.cwd, config, undefined);
  const bundle = loadBundle(bundleRoot, profileDir);

  if (sub === "export") {
    if (values.format !== undefined && values.format !== "json") {
      throw new UsageError(`graph export only supports --format json, got "${values.format}"`);
    }
    const nodes = bundle.graph.allArtifacts().map((a) => ({ id: a.id, type: a.type }));
    const edges = edgeRows(bundle).map((r) => ({ from: r.artifact, relationship: r.relationship, targetId: r.target }));
    env.print(JSON.stringify({ nodes, edges }, null, 2) + "\n");
    return EXIT_CLEAN;
  }

  // matrix
  if (values.format !== undefined && values.format !== "json" && values.format !== "csv") {
    throw new UsageError(`graph matrix --format must be "json" or "csv", got "${values.format}"`);
  }
  const format = values.format ?? "json";
  const rows = edgeRows(bundle);

  if (format === "csv") {
    const lines = ["artifact,relationship,target", ...rows.map((r) => `${r.artifact},${r.relationship},${r.target}`)];
    env.print(lines.join("\n") + "\n");
  } else {
    env.print(JSON.stringify(rows, null, 2) + "\n");
  }
  return EXIT_CLEAN;
}
