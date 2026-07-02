// Agent-assisted authoring (UI-014): drive a pluggable coding harness (default
// Claude Code; Codex/OpenCode by config) headless on a prompt, stream its output
// over SSE, then re-validate to show the deterministic effect. Suggest-only — the
// prompt forbids committing; argv is an array (no shell injection). The runner is
// injectable so tests exercise the flow without a live harness.
import { stableStringify } from "../graphx/encode.ts";
import type { Config } from "../config/config.ts";
import { validate } from "../validate/validate.ts";
import type { StudioContext } from "./api.ts";
import type { Broadcaster, PostHandler } from "./server.ts";
import { changedFiles } from "./git.ts";
import { publishState } from "./author.ts";

function json(obj: unknown, status = 200): Response {
  return new Response(stableStringify(obj), { status, headers: { "content-type": "application/json" } });
}

// buildArgv substitutes the prompt as a SINGLE argv element — never a shell token.
export function buildArgv(cfg: Config, prompt: string): string[] {
  return [cfg.harness.command, ...cfg.harness.args.map((a) => (a === "{prompt}" ? prompt : a))];
}

export function buildPrompt(intent: string, skill?: string): string {
  const lead = skill ? `Run /${skill}. ` : "";
  return `${lead}${intent}\n\nWrite the artifact files into the working tree. Do NOT \`git add\` and do NOT commit — leave the edits unstaged for the human to review.`;
}

export type HarnessRunner = (ctx: StudioContext, prompt: string, emit: (line: string) => void) => Promise<number>;

export function preflight(cfg: Config): { available: boolean; version: string; message: string } {
  const bin = cfg.harness.command;
  if (!Bun.which(bin)) {
    return { available: false, version: "", message: `'${bin}' is not on PATH; install it or set harness.command. The rest of Studio works without it.` };
  }
  let version = "";
  try {
    version = new TextDecoder().decode(Bun.spawnSync([bin, "--version"]).stdout).trim();
  } catch {
    /* version probe is best-effort */
  }
  return { available: true, version, message: `${bin} found` };
}

// defaultRunner spawns the harness argv in the bundle dir and streams its output.
export function defaultRunner(): HarnessRunner {
  return async (ctx, prompt, emit) => {
    const proc = Bun.spawn(buildArgv(ctx.cfg, prompt), { cwd: ctx.bundleDir, stdout: "pipe", stderr: "pipe" });
    const pump = async (stream: ReadableStream<Uint8Array> | undefined) => {
      if (!stream) return;
      const reader = stream.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) emit(l);
      }
      if (buf) emit(buf);
    };
    await Promise.all([pump(proc.stdout), pump(proc.stderr)]);
    return await proc.exited;
  };
}

export function handleAgentFactory(runner: HarnessRunner): PostHandler {
  return async (ctx, req, bcast) => {
    const pf = preflight(ctx.cfg);
    if (!pf.available) return json({ error: pf.message }, 503);
    let body: { intent?: string; skill?: string };
    try {
      body = (await req.json()) as { intent?: string; skill?: string };
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const intent = (body.intent ?? "").trim();
    if (intent === "") return json({ error: "intent required" }, 400);

    const errorsBefore = validate(ctx.bundleDir, ctx.cfg).filter((f) => f.severity === "error").length;
    bcast.publish("agent.start", JSON.stringify({ skill: body.skill ?? "", intent }));
    let exit: number;
    try {
      exit = await runner(ctx, buildPrompt(intent, body.skill), (line) => bcast.publish("agent.log", line));
    } catch (e) {
      return json({ error: `harness run failed: ${(e as Error).message}` }, 500);
    }
    const errorsAfter = validate(ctx.bundleDir, ctx.cfg).filter((f) => f.severity === "error").length;
    let changed: string[] = [];
    try {
      changed = changedFiles(ctx.bundleDir);
    } catch {
      /* not a git repo */
    }
    publishState(ctx, bcast);
    const result = { ok: exit === 0, exit, errorsBefore, errorsAfter, changedFiles: changed };
    bcast.publish("agent.done", JSON.stringify(result));
    return json(result);
  };
}
