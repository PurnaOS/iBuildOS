// Operate the system from the UI (UI-013): run the deterministic gate or the
// configured external tools and return their output. In-process for `validate`;
// shells the configured commands for `test`/`check` (orchestrate, never reinvent).
import { stableStringify } from "../graphx/encode.ts";
import { validate } from "../validate/validate.ts";
import { text as reportText } from "../report/report.ts";
import { runCommand } from "../tooling/orchestrate.ts";
import type { StudioContext } from "./api.ts";

function json(obj: unknown, status = 200): Response {
  return new Response(stableStringify(obj), { status, headers: { "content-type": "application/json" } });
}

export async function handleOperate(ctx: StudioContext, req: Request): Promise<Response> {
  let body: { op?: string };
  try {
    body = (await req.json()) as { op?: string };
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  switch (body.op) {
    case "validate": {
      const f = validate(ctx.bundleDir, ctx.cfg);
      return json({ op: "validate", exit: f.some((x) => x.severity === "error") ? 1 : 0, output: reportText(f) });
    }
    case "test": {
      if (!ctx.cfg.tooling.test) return json({ op: "test", exit: 2, output: "no tooling.test configured in .ibuildos.yaml" });
      const r = runCommand("test", ctx.cfg.tooling.test, ctx.bundleDir);
      return json({ op: "test", exit: r.exit, output: r.output });
    }
    case "check": {
      let out = "";
      let failed = 0;
      for (const cmd of ctx.cfg.tooling.lint) {
        const r = runCommand("lint", cmd, ctx.bundleDir);
        out += `$ ${cmd}\n${r.output.trim()}\n${r.exit === 0 ? "ok" : "FAIL"}\n\n`;
        if (r.exit !== 0) failed++;
      }
      const f = validate(ctx.bundleDir, ctx.cfg);
      const errs = f.filter((x) => x.severity === "error").length;
      out += `validate: ${errs} error(s)\n`;
      return json({ op: "check", exit: failed > 0 || errs > 0 ? 1 : 0, output: out });
    }
    default:
      return json({ error: `unknown op ${JSON.stringify(body.op)} (want validate, test, or check)` }, 400);
  }
}
