// Form-authoring (UI-010): create or edit an artifact from guided, template-backed
// form input. Reuses the deterministic FrontmatterEditor for both new and existing
// files so quoting/body handling is identical. Suggest-only: writes the working
// tree, never stages or commits. Re-validates (scoped) and returns a reviewable diff.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { stableStringify } from "../graphx/encode.ts";
import { validate } from "../validate/validate.ts";
import { FrontmatterEditor } from "../okf/editor.ts";
import type { StudioContext } from "./api.ts";
import type { Broadcaster } from "./server.ts";
import { diff as gitDiff } from "./git.ts";

interface AuthorReq {
  path?: string; // root-relative, e.g. /requirements/fr-0009.md
  type?: string; // required when creating a new artifact
  fields?: Record<string, unknown>;
  links?: Record<string, string[]>;
  body?: string; // used only when creating
}

function json(obj: unknown, status = 200): Response {
  return new Response(stableStringify(obj), { status, headers: { "content-type": "application/json" } });
}

// safeRelPath: a root-relative .md path with no traversal. Rejects everything else.
export function safeRelPath(p: string): boolean {
  if (!p || !p.startsWith("/") || !p.endsWith(".md")) return false;
  if (p.includes("..") || p.includes(" ")) return false;
  return true;
}

// publishState re-publishes validation counts so connected SPAs refresh.
export function publishState(ctx: StudioContext, bcast: Broadcaster): void {
  const findings = validate(ctx.bundleDir, ctx.cfg);
  const errors = findings.filter((f) => f.severity === "error").length;
  bcast.publish("validate", JSON.stringify({ errors, warnings: findings.length - errors }));
  bcast.publish("graph", "changed");
}

export async function handleAuthor(ctx: StudioContext, req: Request, bcast: Broadcaster): Promise<Response> {
  let body: AuthorReq;
  try {
    body = (await req.json()) as AuthorReq;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const path = body.path ?? "";
  if (!safeRelPath(path)) return json({ error: "path must be a root-relative .md path with no '..'" }, 400);

  const abs = ctx.cfg.resolveLink(path);
  if (ctx.cfg.linkEscapesRoot(abs)) return json({ error: "path escapes the bundle root" }, 400);

  const exists = existsSync(abs);
  let raw: string;
  if (exists) {
    raw = readFileSync(abs, "utf8");
  } else {
    if (!body.type) return json({ error: "a new artifact requires `type`" }, 400);
    raw = `---\ntype: ${body.type}\n---\n\n${body.body ?? ""}\n`;
  }

  let ed: FrontmatterEditor;
  try {
    ed = new FrontmatterEditor(raw);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  for (const [k, v] of Object.entries(body.fields ?? {})) {
    if (k === "type" || k === "links") continue; // type is fixed; links handled below
    if (v !== undefined && v !== null && v !== "") ed.setScalar(k, String(v));
  }
  for (const [rel, targets] of Object.entries(body.links ?? {})) {
    for (const t of targets) if (t.trim() !== "") ed.addLink(rel, t.trim());
  }

  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, ed.text());
  } catch (e) {
    return json({ error: `cannot write: ${(e as Error).message}` }, 500);
  }

  const bundleRel = ctx.cfg.bundleRel(abs);
  const findings = validate(ctx.bundleDir, ctx.cfg, { scope: [bundleRel] });
  publishState(ctx, bcast);
  let d = "";
  try {
    d = gitDiff(ctx.bundleDir);
  } catch {
    /* not a git repo — fine */
  }
  return json({ path, action: exists ? "updated" : "created", findings, diff: d });
}

// handleDiscard reverts working-tree changes to the named paths — the ONLY git
// mutation the server makes.
export async function handleDiscard(ctx: StudioContext, req: Request, bcast: Broadcaster): Promise<Response> {
  let body: { paths?: string[] };
  try {
    body = (await req.json()) as { paths?: string[] };
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const paths = (body.paths ?? []).filter((p) => typeof p === "string" && p !== "" && !p.startsWith("-") && !p.includes(".."));
  if (paths.length === 0) return json({ error: "no valid paths" }, 400);
  const { checkout } = await import("./git.ts");
  try {
    checkout(ctx.bundleDir, paths);
  } catch (e) {
    return json({ error: `discard failed: ${(e as Error).message}` }, 500);
  }
  publishState(ctx, bcast);
  return json({ discarded: paths });
}
