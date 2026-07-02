// AI-free predictive diff (UI-011): apply mechanical frontmatter ops to a throwaway
// shadow worktree of HEAD, re-validate, and diff before/after — so a reviewer sees
// the validation + traceability impact of an edit before making it. Port of the
// legacy serve/simulate.go. Touches only detached worktrees outside the repo.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableStringify } from "../graphx/encode.ts";
import { load, type Config } from "../config/config.ts";
import { validate } from "../validate/validate.ts";
import { buildExportGraph } from "../validate/export.ts";
import { buildRtm } from "../graphx/rtm.ts";
import { fingerprint } from "../validate/baseline.ts";
import type { Finding } from "../model/model.ts";
import { FrontmatterEditor } from "../okf/editor.ts";
import type { StudioContext } from "./api.ts";
import { toplevel, prefix, addWorktree } from "./git.ts";

interface Op {
  op: "set-status" | "add-link" | "set-field";
  key: string;
  to?: string;
  rel?: string;
  field?: string;
  value?: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(stableStringify(obj), { status, headers: { "content-type": "application/json" } });
}

function validateOp(op: Op): string | null {
  if (!op.key || !op.key.startsWith("/")) return "op key must be a root-relative path";
  switch (op.op) {
    case "set-status":
      return op.to ? null : "set-status requires `to`";
    case "set-field":
      if (!op.field) return "set-field requires `field`";
      if (op.field === "type" || op.field === "links") return "set-field cannot edit type/links";
      return null;
    case "add-link":
      return op.rel && op.to ? null : "add-link requires `rel` and `to`";
    default:
      return `unknown op ${JSON.stringify((op as { op: string }).op)}`;
  }
}

function applyOp(bundleDir: string, cfg: Config, op: Op): void {
  const abs = cfg.resolveLink(op.key);
  if (cfg.linkEscapesRoot(abs)) throw new Error(`op key escapes the bundle root: ${op.key}`);
  const ed = new FrontmatterEditor(readFileSync(abs, "utf8"));
  if (op.op === "set-status") ed.setScalar("status", op.to!);
  else if (op.op === "set-field") ed.setScalar(op.field!, op.value ?? "");
  else ed.addLink(op.rel!, op.to!);
  writeFileSync(abs, ed.text());
}

function cfgFor(ctx: StudioContext, bundleDir: string): Config {
  const c = load(bundleDir);
  if (ctx.cfg.typesDirOverride) c.typesDirOverride = ctx.cfg.typesDirOverride;
  return c;
}

interface Snap {
  findings: Finding[];
  errors: number;
  traced: number;
  requirements: number;
}

function snapshot(ctx: StudioContext, bundleDir: string): Snap {
  const cfg = cfgFor(ctx, bundleDir);
  const findings = validate(bundleDir, cfg);
  const { graph, reg } = buildExportGraph(bundleDir, cfg, { body: "none" });
  const rtm = buildRtm(graph, reg, cfg);
  return {
    findings,
    errors: findings.filter((f) => f.severity === "error").length,
    traced: rtm.summary.traced,
    requirements: rtm.summary.requirements,
  };
}

export async function handleSimulate(ctx: StudioContext, req: Request): Promise<Response> {
  let body: { ops?: Op[] };
  try {
    body = (await req.json()) as { ops?: Op[] };
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const ops = body.ops ?? [];
  if (ops.length === 0) return json({ error: "no ops" }, 400);
  for (let i = 0; i < ops.length; i++) {
    const err = validateOp(ops[i]!);
    if (err) return json({ error: `op[${i}]: ${err}` }, 400);
  }

  let top: string, pfx: string;
  try {
    top = toplevel(ctx.bundleDir);
    pfx = prefix(ctx.bundleDir);
  } catch (e) {
    return json({ error: `simulate needs a git repo: ${(e as Error).message}` }, 400);
  }

  const base = addWorktree(top, "HEAD");
  const shadow = addWorktree(top, "HEAD");
  try {
    const shadowBundle = pfx ? join(shadow.dir, pfx) : shadow.dir;
    for (const op of ops) applyOp(shadowBundle, cfgFor(ctx, shadowBundle), op);
    const before = snapshot(ctx, pfx ? join(base.dir, pfx) : base.dir);
    const after = snapshot(ctx, shadowBundle);

    const beforeKeys = new Set(before.findings.map(fingerprint));
    const afterKeys = new Set(after.findings.map(fingerprint));
    return json({
      newFindings: after.findings.filter((f) => !beforeKeys.has(fingerprint(f))),
      resolvedFindings: before.findings.filter((f) => !afterKeys.has(fingerprint(f))),
      errorDelta: after.errors - before.errors,
      exitBefore: before.errors > 0 ? 1 : 0,
      exitAfter: after.errors > 0 ? 1 : 0,
      tracedBefore: before.traced,
      tracedAfter: after.traced,
      requirements: after.requirements,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  } finally {
    base.cleanup();
    shadow.cleanup();
  }
}
