// Enforces the "Code" node of the chain: an artifact carrying the configured
// code field must have at least one glob match on disk. Port of Go
// internal/validate/code.go.
import type { Config } from "../config/config.ts";
import { Collector } from "../model/model.ts";
import { anyMatch } from "../okf/glob.ts";
import { scalarText, nodeIsScalar, nodeIsSeq, seqItems } from "../okf/frontmatter.ts";
import type { Artifact } from "./validate.ts";

export function validateCode(a: Artifact, cfg: Config, c: Collector): void {
  const globs = scalarListField(a, cfg.chain.codeField);
  if (globs.length === 0) return;
  const g = a.doc!.get(cfg.chain.codeField);
  const line = a.doc!.line(g?.keyNode);
  let matched: boolean;
  try {
    matched = anyMatch(cfg.bundleDir, globs);
  } catch (e) {
    c.errf(a.path, line, "code.noMatch", `invalid code glob in ${JSON.stringify(globs)}: ${(e as Error).message}`);
    return;
  }
  if (!matched) {
    c.errf(a.path, line, "code.noMatch", `code globs ${JSON.stringify(globs)} matched no files on disk`);
  }
}

// scalarListField returns the string items of a list-valued frontmatter field. A
// scalar value is tolerated as a single-element list. nil when absent/empty.
export function scalarListField(a: Artifact, field: string): string[] {
  if (!a.doc) return [];
  const g = a.doc.get(field);
  if (!g) return [];
  const vn = g.valNode;
  if (nodeIsScalar(vn)) {
    const t = scalarText(vn);
    return t !== "" ? [t] : [];
  }
  if (nodeIsSeq(vn)) {
    return seqItems(vn).map(scalarText).filter((t) => t !== "");
  }
  return [];
}
