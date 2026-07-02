import { test, expect, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { load } from "../src/core/config/config.ts";
import { serve, type RunningStudio } from "../src/core/studio/server.ts";
import { studioHandlers } from "../src/core/studio/handlers.ts";
import { init } from "../src/core/scaffold/scaffold.ts";
import { buildArgv } from "../src/core/studio/agent.ts";

const repoRoot = join(import.meta.dir, "..");
let running: RunningStudio | null = null;

function start(): RunningStudio {
  running = serve({ bundleDir: repoRoot, cfg: load(repoRoot), version: "test" }, 0);
  return running;
}
const url = (s: RunningStudio, p: string) => `http://127.0.0.1:${s.port}${p}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gj = async (s: RunningStudio, p: string): Promise<any> => (await fetch(url(s, p))).json();

afterEach(() => {
  running?.stop();
  running = null;
});

test("Studio binds loopback and serves the SPA shell at /", async () => {
  const s = start();
  const res = await fetch(url(s, "/"));
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("iBuild Studio");
  expect(html).toContain("/api/status"); // fetch-driven
  expect(await (await fetch(url(s, "/healthz"))).text()).toBe("ok\n");
});

test("read oracles return engine data", async () => {
  const s = start();
  const status = await gj(s, "/api/status");
  expect(status.validation.errors).toBe(0);
  expect(status.requirements.requirements).toBeGreaterThan(190);

  const matrix = await gj(s, "/api/matrix");
  expect(matrix.summary.requirements).toBeGreaterThan(190);

  const graph = await gj(s, "/api/graph?body=none");
  expect(graph.nodes.length).toBeGreaterThan(200);

  const cfg = await gj(s, "/api/config");
  expect(cfg.chain.implementsRel).toBe("implements");
  expect(cfg.profile.name).toBe("ibuildos-base");

  const instr = await gj(s, "/api/instructions/Task");
  expect(instr.name).toBe("Task");

  const mine = await gj(s, "/api/mine?as=srini");
  expect(mine.owned).toContain("/requirements/fr-0001.md");

  const md = await fetch(url(s, "/api/agents.md"));
  expect(md.headers.get("content-type")).toContain("text/markdown");

  expect((await fetch(url(s, "/api/nope"))).status).toBe(404);
});

test("SSE /api/events opens with a ready event", async () => {
  const s = start();
  const res = await fetch(url(s, "/api/events"));
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toContain("event: ready");
  await reader.cancel();
});

// --- authoring + review against a throwaway git bundle (never the real repo) ---
function gitBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "studio-git-"));
  init(dir, { full: true });
  const g = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  g("init", "-q");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  return dir;
}
function startBundle(dir: string): RunningStudio {
  running = serve({ bundleDir: dir, cfg: load(dir), version: "test" }, 0, studioHandlers());
  return running;
}
const post = (s: RunningStudio, p: string, body: unknown) =>
  fetch(url(s, p), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("authoring writes the working tree (suggest-only), diff + discard work", async () => {
  const dir = gitBundle();
  const s = startBundle(dir);

  // create a new requirement via the form endpoint
  const create = await post(s, "/api/author", {
    path: "/requirements/fr-0009.md", type: "FunctionalRequirement",
    fields: { id: "FR-0009", title: "t", owner: "o", status: "proposed" },
  });
  const cj = (await create.json()) as any;
  expect(create.status).toBe(200);
  expect(cj.action).toBe("created");
  expect(existsSync(join(dir, "docs/requirements/fr-0009.md"))).toBe(true);
  expect(cj.findings.filter((f: any) => f.severity === "error").length).toBe(0);

  // commit it so an edit produces a tracked diff, then edit + check diff + discard
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "fr"]);
  await post(s, "/api/author", { path: "/requirements/fr-0009.md", fields: { status: "accepted" } });
  const diff = await (await fetch(url(s, "/api/diff"))).text();
  expect(diff).toContain("fr-0009.md");
  expect(diff).toContain("accepted");

  const disc = await post(s, "/api/discard", { paths: ["docs/requirements/fr-0009.md"] });
  expect((await disc.json() as any).discarded).toContain("docs/requirements/fr-0009.md");
  expect(await (await fetch(url(s, "/api/diff"))).text()).toBe("");

  // path-traversal + non-.md are rejected
  expect((await post(s, "/api/author", { path: "/../etc/x.md", type: "X" })).status).toBe(400);
});

test("simulate predicts validation impact on a shadow worktree", async () => {
  const dir = gitBundle();
  const s = startBundle(dir);
  await post(s, "/api/author", {
    path: "/requirements/fr-0009.md", type: "FunctionalRequirement",
    fields: { id: "FR-0009", title: "t", owner: "o", status: "accepted" },
  });
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "fr"]);

  // an accepted requirement with nothing implementing/verifying it errors;
  // deprecating it should resolve those errors (errorDelta < 0).
  const r = await post(s, "/api/simulate", { ops: [{ op: "set-status", key: "/requirements/fr-0009.md", to: "deprecated" }] });
  const sj = (await r.json()) as any;
  expect(r.status).toBe(200);
  expect(sj.errorDelta).toBeLessThanOrEqual(0);
  expect(Array.isArray(sj.resolvedFindings)).toBe(true);
});

// --- operate + agent-assist + workspaces (12b.3) ---
test("operate runs the deterministic gate from the UI", async () => {
  // validate is read-only; serve the real repo with the POST handlers registered.
  running = serve({ bundleDir: repoRoot, cfg: load(repoRoot), version: "test" }, 0, studioHandlers());
  const s = running;
  const r = await post(s, "/api/operate", { op: "validate" });
  const d = (await r.json()) as any;
  expect(d.op).toBe("validate");
  expect(d.exit).toBe(0);
  expect(d.output).toContain("OK");
  expect((await post(s, "/api/operate", { op: "bogus" })).status).toBe(400);
});

test("agent-assist: argv is injection-safe; preflight + stubbed run are suggest-only", async () => {
  // the prompt is one argv element, even with shell metacharacters
  const cfg = load(repoRoot);
  const argv = buildArgv(cfg, "evil; rm -rf / $(touch pwned) `id`");
  expect(argv).toContain("evil; rm -rf / $(touch pwned) `id`");
  expect(argv[0]).toBe("claude");

  // run with a stubbed harness (no live agent). harness.command must be on PATH
  // for preflight to pass, so point it at `bun`; the stub never spawns it.
  const dir = mkdtempSync(join(tmpdir(), "studio-agent-"));
  init(dir, { full: true });
  const acfg = load(dir);
  acfg.harness.command = "bun"; // exists on PATH
  let got = "";
  running = serve({ bundleDir: dir, cfg: acfg, version: "test" }, 0, studioHandlers({
    harnessRunner: async (_c, prompt, emit) => { got = prompt; emit("working…"); return 0; },
  }));
  const res = await post(running, "/api/agent", { intent: "add an example requirement" });
  const aj = (await res.json()) as any;
  expect(res.status).toBe(200);
  expect(aj.ok).toBe(true);
  expect(aj.exit).toBe(0);
  expect(got).toContain("add an example requirement");
  expect(got).toContain("Do NOT"); // no-commit contract appended
  expect((await post(running, "/api/agent", { intent: "" })).status).toBe(400);
});

test("workspaces lists git worktrees", async () => {
  const s = start();
  const ws = (await gj(s, "/api/workspaces")) as any[];
  expect(Array.isArray(ws)).toBe(true);
});

test("requirements are grouped by capability area with traced counts", async () => {
  const s = start();
  const r = (await gj(s, "/api/requirements"));
  expect(r.summary.requirements).toBeGreaterThan(190);
  expect(r.areas.length).toBeGreaterThan(10); // ~22 areas, not one flat list
  const ks = r.areas.find((a: any) => a.area === "KS");
  expect(ks.items.length).toBe(9);
  expect(ks.items.every((i: any) => i.id.startsWith("KS-"))).toBe(true);
  expect(typeof ks.traced).toBe("number");
});

test("node detail returns full body + outgoing/incoming links", async () => {
  const s = start();
  const d = await gj(s, "/api/node?key=" + encodeURIComponent("/requirements/fr-0001.md"));
  expect(d.node.type).toBe("FunctionalRequirement");
  expect(d.node.excerpt.length).toBeGreaterThan(0); // full body
  expect(d.node.fields.id).toBe("FR-0001");
  // the seed chain: task-0001 implements it, test-okf verifies it → both incoming
  const inFrom = d.incoming.map((e: any) => e.key);
  expect(inFrom).toContain("/work/task-0001.md");
  expect(inFrom).toContain("/tests/test-okf.md");
  expect((await fetch(url(s, "/api/node"))).status).toBe(400); // missing ?key=
});

test("plan board + team views are data-driven", async () => {
  const s = start();
  const board = await gj(s, "/api/board");
  expect(board.total).toBeGreaterThan(0); // the adoption Initiative + 14 Epics
  expect(board.items.every((i: any) => typeof i.status === "string")).toBe(true);
  expect(board.items.some((i: any) => i.type === "Epic")).toBe(true);

  const team = await gj(s, "/api/team");
  expect(team.owners.some((o: any) => o.owner === "srini")).toBe(true);
});
