#!/usr/bin/env bun
// iBuild CLI entry. Thin dispatch over the deterministic core in src/core.
// Exit-code contract: 0 = ok / warnings-only, 1 = error findings, 2 = usage error.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeBaseline, loadBaseline, applyBaseline } from "./core/validate/baseline.ts";
import { Version } from "./version.ts";
import { load } from "./core/config/config.ts";
import { validate } from "./core/validate/validate.ts";
import { text as reportText, json as reportJSON } from "./core/report/report.ts";
import { init } from "./core/scaffold/scaffold.ts";
import { agentsMD } from "./core/contract/contract.ts";
import { Registry } from "./core/types/registry.ts";
import { Collector } from "./core/model/model.ts";
import { buildExportGraph } from "./core/validate/export.ts";
import { stableJSON, stableStringify } from "./core/graphx/encode.ts";
import { toGraphML } from "./core/graphx/graphml.ts";
import { buildRtm } from "./core/graphx/rtm.ts";
import { buildImpact } from "./core/graphx/impact.ts";
import { buildGaps } from "./core/graphx/gaps.ts";
import { write as writeInstructions } from "./core/instructions/instructions.ts";
import { runCommand, testResultDoc } from "./core/tooling/orchestrate.ts";
import { buildStatus } from "./core/metrics/status.ts";
import { buildMine } from "./core/metrics/mine.ts";
import { statusReport, releaseNotes } from "./core/report/comms.ts";
import { renderSite } from "./core/site/site.ts";
import { serve as serveStudio } from "./core/studio/server.ts";
import { studioHandlers } from "./core/studio/handlers.ts";
import { statSync } from "node:fs";
import { matchFiles } from "./core/okf/glob.ts";
import { countBySeverity } from "./core/model/model.ts";
import { existsSync } from "node:fs";

const USAGE = `iBuild ${Version} — OKF-SDLC traceability linter

Usage:
  iBuild init [path] [--full] [--example]
  iBuild validate [path] [--format text|json] [--types <dir>]
                  [--scope <glob,glob>] [--changed] [--baseline] [--report-only]
  iBuild baseline [path] [--out <file>]         record accepted pre-existing debt (brownfield)
  iBuild graph [path] [--format json|graphml] [--body excerpt|full|none]
               [--node <ref> [--depth N] [--rel a,b]] [--types <dir>]
  iBuild matrix [path] [--types <dir>]          requirements traceability matrix (JSON)
  iBuild impact <file...> | --changed [--types <dir>]   what a code change affects (JSON)
  iBuild gaps [path] [--types <dir>]            orphan code + untested requirements (JSON)
  iBuild status [path] [--types <dir>]          progress + coverage + KB-health dashboard (JSON)
  iBuild mine [path] [--as <name>] [--types <dir>]   your owned + assigned work (JSON)
  iBuild report [path] [--kind status|release] [--release <key>] [--out <file>]   draft a stakeholder report
  iBuild site [path] [--out <file|dir>] [--types <dir>]   self-contained offline HTML portal
  iBuild serve [path] [--port N] [--types <dir>]   interactive local Studio app (localhost-only)
  iBuild check [path] [--types <dir>]           unified gate: lint + staleness + validate
  iBuild test [path] [--cmd <c>] [--record <file> [--id <slug>]]   run the test runner; record a TestResult
  iBuild instructions [Type] [--format text|json] [--types <dir>]
  iBuild agents [path] [--out <file>] [--types <dir>]
  iBuild version
  iBuild help

  init          scaffold a new project (lean core profile; --full for the whole taxonomy)
  validate      check the bundle; deterministic gate (the AI layer never runs here)
  graph         export the typed link graph as JSON (or GraphML); --node focuses a neighborhood
  matrix        requirements traceability matrix: who implements/verifies each requirement
  instructions  print an authoring template for a type (from docs/types/); no arg lists all
  agents        emit AGENTS.md: the contract surface for other coding agents
  --scope       only report findings for artifacts matching these bundle-relative globs
  --changed     scope to files changed vs HEAD (git) — for pre-commit / CI gating
  --base <ref>  scope to files changed since <ref> (e.g. origin/main) — stack/PR gate
  --report-only annotate findings without failing the build (non-blocking adoption)
  --baseline    subtract accepted pre-existing debt (.ibuildos-baseline.json)

Exit codes: 0 = no errors, 1 = validation errors, 2 = usage error.`;

// splitArgs pulls the first positional (the bundle path) out so flags may appear
// before or after it. Value-taking flags consume their following token.
const VALUE_FLAGS = new Set([
  "--format", "-format", "--types", "-types", "--out", "-out", "--scope", "-scope",
  "--body", "-body", "--node", "-node", "--depth", "-depth", "--rel", "-rel", "--addr", "-addr",
  "--cmd", "-cmd", "--record", "-record", "--id", "-id",
]);

function splitArgs(args: string[]): { path: string; flags: string[] } {
  let path = "";
  const flags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("-")) {
      flags.push(a);
      if (!a.includes("=") && VALUE_FLAGS.has(a) && i + 1 < args.length) {
        flags.push(args[++i]!);
      }
      continue;
    }
    if (path === "") path = a;
    else flags.push(a); // extra positional -> rejected below
  }
  return { path, flags };
}

// parseFlags reads --k v / --k=v pairs (value flags) and bare --k (bool flags);
// returns the map or null on a bad flag. Bool-flag values are "true".
function parseFlags(flags: string[], valueKeys: Set<string>, boolKeys: Set<string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]!;
    if (!f.startsWith("--")) return null;
    const eq = f.indexOf("=");
    if (eq >= 0) {
      const key = f.slice(2, eq);
      if (!valueKeys.has(key) && !boolKeys.has(key)) return null;
      out[key] = f.slice(eq + 1);
      continue;
    }
    const key = f.slice(2);
    if (boolKeys.has(key)) {
      out[key] = "true";
    } else if (valueKeys.has(key)) {
      out[key] = flags[++i] ?? "";
    } else {
      return null;
    }
  }
  return out;
}

// gitChanged returns repo-relative paths changed for the gate. With a base ref
// it is the integrated stack's change set (base...HEAD) — the VC-007 stack-aware
// gate; otherwise it is the working tree vs HEAD plus untracked files. [] on any
// git failure.
function gitChanged(dir: string, base?: string): string[] {
  const run = (args: string[]): string[] => {
    try {
      return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" })
        .split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  };
  if (base) return [...new Set(run(["diff", "--name-only", `${base}...HEAD`]))];
  return [...new Set([...run(["diff", "--name-only", "HEAD"]), ...run(["ls-files", "--others", "--exclude-standard"])])];
}

function runValidate(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["format", "types", "scope", "base"]), new Set(["changed", "baseline", "report-only"]));
  if (opts === null) {
    process.stderr.write("validate: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const format = opts.format ?? "text";
  if (format !== "text" && format !== "json") {
    process.stderr.write(`invalid --format ${JSON.stringify(format)} (want text or json)\n`);
    return 2;
  }

  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;

  const scope: string[] = [];
  if (opts.scope) scope.push(...opts.scope.split(",").map((s) => s.trim()).filter(Boolean));
  if (opts.changed) scope.push(...gitChanged(path));
  if (opts.base) scope.push(...gitChanged(path, opts.base));

  let findings = validate(path, cfg, scope.length > 0 ? { scope } : {});

  // Baseline (VL-013): subtract accepted pre-existing debt; the gate sees only fresh.
  let baselinedCount = 0;
  if (opts.baseline) {
    const bl = loadBaseline(join(path, ".ibuildos-baseline.json"));
    if (bl) {
      const split = applyBaseline(findings, bl);
      findings = split.fresh;
      baselinedCount = split.baselined.length;
    }
  }

  process.stdout.write(format === "json" ? reportJSON(findings) : reportText(findings));
  if (baselinedCount > 0 && format === "text") {
    process.stdout.write(`(${baselinedCount} pre-existing finding(s) baselined and not gated)\n`);
  }
  if (opts["report-only"]) return 0; // VL-014: annotate without failing the build
  return findings.some((f) => f.severity === "error") ? 1 : 0;
}

// runBaseline records the current findings as accepted debt (VL-013). The
// baseline may only shrink as debt is paid down (ratchet) — regenerate + commit.
function runBaseline(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["out", "types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("baseline: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  const bl = makeBaseline(validate(path, cfg));
  const out = opts.out || join(path, ".ibuildos-baseline.json");
  try {
    writeFileSync(out, JSON.stringify(bl, null, 2) + "\n");
  } catch (e) {
    process.stderr.write(`cannot write baseline: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`wrote ${out} with ${bl.entries.length} accepted finding(s).\n`);
  return 0;
}

function runInit(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set([]), new Set(["full", "example"]));
  if (opts === null) {
    process.stderr.write("init: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  let res;
  try {
    res = init(path, { full: opts.full === "true", example: opts.example === "true" });
  } catch (e) {
    process.stderr.write(`init failed: ${(e as Error).message}\n`);
    return 1;
  }
  if (res.alreadyInit) process.stdout.write(`${path} is already an iBuildOS bundle; only missing files were added.\n`);
  process.stdout.write(`created ${res.created.length} file(s), skipped ${res.skipped.length} existing.\n`);
  for (const p of res.created) process.stdout.write(`  + ${p}\n`);
  if (res.created.length > 0) {
    process.stdout.write(`\nNext: run \`iBuild validate ${path}\` (exits 0), then use /ibuild-discover to start.\n`);
  }
  return 0;
}

function runAgents(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["out", "types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("agents: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  let cfg;
  try {
    cfg = load(path);
  } catch (e) {
    process.stderr.write(`cannot load .ibuildos.yaml: ${(e as Error).message}\n`);
    return 1;
  }
  if (opts.types) cfg.typesDirOverride = opts.types;
  const doc = agentsMD(cfg, Version);
  if (!opts.out) {
    process.stdout.write(doc);
    return 0;
  }
  try {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, doc);
  } catch (e) {
    process.stderr.write(`cannot write AGENTS.md: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`wrote ${opts.out}\n`);
  return 0;
}

function loadCfg(path: string, types: string | undefined): ReturnType<typeof load> | null {
  let cfg;
  try {
    cfg = load(path);
  } catch (e) {
    process.stderr.write(`cannot load .ibuildos.yaml: ${(e as Error).message}\n`);
    return null;
  }
  if (types) cfg.typesDirOverride = types;
  return cfg;
}

function runGraph(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["format", "types", "body", "node", "rel", "depth"]), new Set([]));
  if (opts === null) {
    process.stderr.write("graph: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const format = opts.format ?? "json";
  if (format !== "json" && format !== "graphml") {
    process.stderr.write(`invalid --format ${JSON.stringify(format)} (want json or graphml)\n`);
    return 2;
  }
  const body = (opts.body ?? "excerpt") as "excerpt" | "full" | "none";
  if (!["excerpt", "full", "none"].includes(body)) {
    process.stderr.write(`invalid --body ${JSON.stringify(body)} (want excerpt, full, or none)\n`);
    return 2;
  }
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  try {
    const { graph } = buildExportGraph(path, cfg, {
      body,
      node: opts.node ?? "",
      depth: opts.depth ? Number(opts.depth) : 1,
      rels: opts.rel ? opts.rel.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
    process.stdout.write(format === "graphml" ? toGraphML(graph) : stableJSON(graph));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build graph: ${(e as Error).message}\n`);
    return 1;
  }
}

function runMatrix(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("matrix: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  try {
    const { graph, reg } = buildExportGraph(path, cfg, { body: "none" });
    process.stdout.write(stableStringify(buildRtm(graph, reg, cfg)));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build matrix: ${(e as Error).message}\n`);
    return 1;
  }
}

function runImpact(args: string[]): number {
  // Positionals are changed files (no bundle path); bundle is ".".
  let useChanged = false;
  let typesDir = "";
  const filesArg: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--changed") useChanged = true;
    else if (a === "--types" || a.startsWith("--types=")) typesDir = a.includes("=") ? a.slice(a.indexOf("=") + 1) : (args[++i] ?? "");
    else if (a.startsWith("-")) {
      process.stderr.write(`unknown flag ${JSON.stringify(a)}\n`);
      return 2;
    } else filesArg.push(a);
  }
  const cfg = loadCfg(".", typesDir || undefined);
  if (!cfg) return 1;
  const changed = [...filesArg];
  if (useChanged) changed.push(...gitChanged("."));
  if (changed.length === 0) {
    process.stderr.write("impact: provide one or more changed files, or --changed\n");
    return 2;
  }
  try {
    const { graph } = buildExportGraph(".", cfg, { body: "none" });
    process.stdout.write(stableStringify(buildImpact(graph, cfg, changed)));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build impact: ${(e as Error).message}\n`);
    return 1;
  }
}

// runServe starts the local Studio app on loopback. On success it returns 0 and
// the caller must NOT exit — Bun.serve keeps the process alive serving.
function runServe(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["port", "types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("serve: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  const port = opts.port ? Number(opts.port) : 4321;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`serve: invalid --port ${JSON.stringify(opts.port)}\n`);
    return 2;
  }
  try {
    const s = serveStudio({ bundleDir: path, cfg, version: Version }, port, studioHandlers());
    process.stdout.write(`iBuild Studio (localhost-only) → http://127.0.0.1:${s.port}/\n`);
    process.stdout.write("  read: /api/{status,graph,matrix,gaps,findings,config,types,mine,diff,agents.md}  events: /api/events\n");
    process.stdout.write("  write (suggest-only): POST /api/{author,discard,simulate}\n");
    return 0;
  } catch (e) {
    process.stderr.write(`serve: cannot start: ${(e as Error).message}\n`);
    return 1;
  }
}

function runSite(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["out", "types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("site: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  let html: string;
  try {
    const { graph, reg } = buildExportGraph(path, cfg, { body: "none" });
    html = renderSite(graph, reg, cfg, validate(path, cfg));
  } catch (e) {
    process.stderr.write(`cannot render site: ${(e as Error).message}\n`);
    return 1;
  }
  if (!opts.out) {
    process.stdout.write(html);
    return 0;
  }
  let target = opts.out;
  let isDir = target.endsWith("/");
  try {
    if (statSync(target).isDirectory()) isDir = true;
  } catch { /* not present */ }
  if (isDir) target = join(target, "index.html");
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  } catch (e) {
    process.stderr.write(`cannot write site: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`wrote ${target}\n`);
  return 0;
}

function runReport(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types", "kind", "release", "out"]), new Set([]));
  if (opts === null) {
    process.stderr.write("report: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const kind = opts.kind ?? "status";
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  let doc: string;
  try {
    const { graph, reg } = buildExportGraph(path, cfg, { body: "none" });
    if (kind === "status") {
      doc = statusReport(graph, reg, cfg, validate(path, cfg));
    } else if (kind === "release") {
      if (!opts.release) {
        process.stderr.write("report --kind release requires --release <artifact-key>\n");
        return 2;
      }
      doc = releaseNotes(graph, cfg, opts.release);
    } else {
      process.stderr.write(`invalid --kind ${JSON.stringify(kind)} (want status or release)\n`);
      return 2;
    }
  } catch (e) {
    process.stderr.write(`cannot build report: ${(e as Error).message}\n`);
    return 1;
  }
  if (opts.out) {
    try {
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, doc);
      process.stdout.write(`wrote ${opts.out}\n`);
    } catch (e) {
      process.stderr.write(`cannot write report: ${(e as Error).message}\n`);
      return 1;
    }
  } else {
    process.stdout.write(doc);
  }
  return 0;
}

function runStatus(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("status: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  try {
    const { graph, reg } = buildExportGraph(path, cfg, { body: "none" });
    const findings = validate(path, cfg);
    process.stdout.write(stableStringify(buildStatus(graph, reg, cfg, findings)));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build status: ${(e as Error).message}\n`);
    return 1;
  }
}

function runMine(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types", "as"]), new Set([]));
  if (opts === null) {
    process.stderr.write("mine: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  let identity = opts.as ?? "";
  if (identity === "") {
    // resolve from git identity (name first — owners are typically handles/names)
    identity = runCommand("id", "git config user.name", path).output.trim() || runCommand("id", "git config user.email", path).output.trim();
  }
  if (identity === "") {
    process.stderr.write("mine: could not resolve an identity; pass --as <name>\n");
    return 2;
  }
  try {
    const { graph } = buildExportGraph(path, cfg, { body: "none" });
    process.stdout.write(stableStringify(buildMine(graph, identity)));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build queue: ${(e as Error).message}\n`);
    return 1;
  }
}

function runGaps(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("gaps: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  let sourceFiles: string[] = [];
  if (cfg.tooling.source.length > 0 && existsSync(cfg.bundleDir)) {
    try {
      sourceFiles = matchFiles(cfg.bundleDir, cfg.tooling.source);
    } catch { /* leave empty */ }
  }
  try {
    const { graph, reg } = buildExportGraph(path, cfg, { body: "none" });
    process.stdout.write(stableStringify(buildGaps(graph, reg, cfg, sourceFiles)));
    return 0;
  } catch (e) {
    process.stderr.write(`cannot build gaps: ${(e as Error).message}\n`);
    return 1;
  }
}

// runCheck is the unified quality gate (CQ-002): orchestrate the configured code
// linters + staleness checker, then run the deterministic traceability gate.
function runCheck(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("check: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;

  let failed = 0;
  const cmds: Array<[string, string]> = [];
  cfg.tooling.lint.forEach((c, i) => cmds.push([`lint[${i}]`, c]));
  if (cfg.tooling.staleness) cmds.push(["staleness", cfg.tooling.staleness]);
  for (const [label, cmd] of cmds) {
    const r = runCommand(label, cmd, path);
    process.stdout.write(`${r.exit === 0 ? "ok  " : "FAIL"} ${label}: ${cmd}\n`);
    if (r.exit !== 0) {
      failed++;
      process.stdout.write(r.output.trim() + "\n");
    }
  }
  // The deterministic traceability gate, in-process.
  const findings = validate(path, cfg);
  const { errors } = countBySeverity(findings);
  process.stdout.write(`${errors === 0 ? "ok  " : "FAIL"} validate: ${errors} error(s)\n`);
  return failed === 0 && errors === 0 ? 0 : 1;
}

// runTest orchestrates the project's test runner (TT-009) and optionally records
// the outcome as a TestResult artifact (TT-008).
function runTest(args: string[]): number {
  const { path: rawPath, flags } = splitArgs(args);
  const opts = parseFlags(flags, new Set(["cmd", "record", "id", "types"]), new Set([]));
  if (opts === null) {
    process.stderr.write("test: bad flag\n" + USAGE + "\n");
    return 2;
  }
  const path = rawPath === "" ? "." : rawPath;
  const cfg = loadCfg(path, opts.types);
  if (!cfg) return 1;
  const cmd = opts.cmd || cfg.tooling.test;
  if (!cmd) {
    process.stderr.write("test: no test command (set tooling.test in .ibuildos.yaml or pass --cmd)\n");
    return 2;
  }
  const r = runCommand("test", cmd, path);
  process.stdout.write(r.output);
  if (opts.record) {
    const status = r.exit === 0 ? "passed" : "failed";
    const ranAt = new Date().toISOString().slice(0, 10);
    try {
      mkdirSync(dirname(opts.record), { recursive: true });
      writeFileSync(opts.record, testResultDoc(opts.id || "latest", status, cmd, ranAt));
      process.stdout.write(`\nrecorded TestResult -> ${opts.record}\n`);
    } catch (e) {
      process.stderr.write(`cannot record result: ${(e as Error).message}\n`);
    }
  }
  return r.exit === 0 ? 0 : 1;
}

function runInstructions(args: string[]): number {
  // The positional here is a TYPE name, not a path.
  let format = "text";
  let typesDir = "";
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--format" || a.startsWith("--format=")) {
      format = a.includes("=") ? a.slice(a.indexOf("=") + 1) : (args[++i] ?? "");
    } else if (a === "--types" || a.startsWith("--types=")) {
      typesDir = a.includes("=") ? a.slice(a.indexOf("=") + 1) : (args[++i] ?? "");
    } else if (a.startsWith("-")) {
      process.stderr.write(`unknown flag ${JSON.stringify(a)}\n`);
      return 2;
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length > 1) {
    process.stderr.write("instructions takes at most one type name\n");
    return 2;
  }
  if (format !== "text" && format !== "json") {
    process.stderr.write(`invalid --format ${JSON.stringify(format)} (want text or json)\n`);
    return 2;
  }
  const cfg = loadCfg(".", typesDir || undefined);
  if (!cfg) return 1;
  let reg: Registry;
  try {
    reg = Registry.load(cfg.typesDir(), cfg.bundleDir, new Collector());
  } catch (e) {
    process.stderr.write(`cannot load types from ${cfg.typesDir()}: ${(e as Error).message}\n`);
    return 1;
  }
  try {
    process.stdout.write(writeInstructions(reg, positionals[0] ?? "", format));
    return 0;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 1;
  }
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "init":
      return runInit(rest);
    case "validate":
      return runValidate(rest);
    case "baseline":
      return runBaseline(rest);
    case "graph":
      return runGraph(rest);
    case "matrix":
      return runMatrix(rest);
    case "impact":
      return runImpact(rest);
    case "gaps":
      return runGaps(rest);
    case "status":
      return runStatus(rest);
    case "mine":
      return runMine(rest);
    case "report":
      return runReport(rest);
    case "site":
      return runSite(rest);
    case "check":
      return runCheck(rest);
    case "test":
      return runTest(rest);
    case "instructions":
      return runInstructions(rest);
    case "agents":
      return runAgents(rest);
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(Version + "\n");
      return 0;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(USAGE + "\n");
      return 0;
    case undefined:
      process.stdout.write(USAGE + "\n");
      return 0;
    default:
      process.stderr.write(`iBuild: unknown command ${JSON.stringify(cmd)}\n\n${USAGE}\n`);
      return 2;
  }
}

const argv = process.argv.slice(2);
if (argv[0] === "serve") {
  // serve blocks: on a clean start Bun.serve keeps the process alive; only exit on error.
  const rc = runServe(argv.slice(1));
  if (rc !== 0) process.exit(rc);
} else {
  process.exit(main(argv));
}
