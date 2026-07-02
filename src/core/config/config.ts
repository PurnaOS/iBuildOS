// Loads .ibuildos.yaml (with defaults) and resolves the bundle layout: where the
// type definitions live, which files are artifacts, and how root-relative link
// paths map onto disk. Port of Go internal/config.
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as yamlParse } from "yaml";

function toSlash(p: string): string {
  return p.replaceAll("\\", "/");
}

// ChainConfig is the SINGLE locus of coupling to the Requirement -> Task -> Code
// -> Test chain. It names the relationships/field the completeness rules key off,
// plus the one unavoidable value coupling: the status vocabularies. Everything
// else in the validator is fully data-driven from docs/types/.
export interface ChainConfig {
  implementsRel: string;
  verifiesRel: string;
  verifiedByRel: string;
  parentRel: string;
  codeField: string;
  activeReqStatuses: string[];
  proposedStatuses: string[];
  doneStatuses: string[];
  passingStatuses: string[];
}

export function defaultChain(): ChainConfig {
  return {
    implementsRel: "implements",
    verifiesRel: "verifies",
    verifiedByRel: "verified_by",
    parentRel: "parent",
    codeField: "code",
    activeReqStatuses: ["accepted", "implemented"],
    proposedStatuses: ["proposed"],
    doneStatuses: ["done"],
    passingStatuses: ["passing"],
  };
}

// ToolingConfig declares the external tools iBuild orchestrates (it reinvents
// none of them): the project's test runner, code linters, and staleness checker,
// plus the source globs used for orphan-code gap detection. All optional.
export interface ToolingConfig {
  test: string; // command to run the project's automated tests
  lint: string[]; // code-lint / format commands
  staleness: string; // the team's existing staleness checker
  source: string[]; // source-file globs (for "code with no linked task" gaps)
}

export function defaultTooling(): ToolingConfig {
  return { test: "", lint: [], staleness: "", source: [] };
}

// HarnessConfig is the pluggable coding-agent the Studio drives for agent-assisted
// authoring (UI-014). Harness-agnostic by config: `command` is the binary, `args`
// the argv template ("{prompt}" is substituted as ONE element — never a shell
// string). Default targets Claude Code; Codex/OpenCode set their own args.
export interface HarnessConfig {
  name: string;
  command: string;
  args: string[];
}

export function defaultHarness(): HarnessConfig {
  return { name: "claude", command: "claude", args: ["-p", "{prompt}", "--permission-mode", "acceptEdits"] };
}

// Config is the resolved bundle configuration for one run.
export class Config {
  root = "docs";
  types = "types";
  artifacts: string[] = ["requirements/**", "work/**", "tests/**"];
  chain: ChainConfig = defaultChain();
  tooling: ToolingConfig = defaultTooling();
  harness: HarnessConfig = defaultHarness();
  // The SDLC profile this bundle targets — semantically versioned + shareable
  // (GV-001/003). Pinned in-repo so tool, profile, and OKF-spec versions agree
  // within a commit (VL-012 / decision D-008).
  profile: { name: string; version: string } = { name: "ibuildos-base", version: "0.5.0" };
  bundleDir = ""; // the [path] argument
  typesDirOverride = ""; // from --types

  // rootDir is the absolute knowledge-bundle root (bundleDir/root).
  rootDir(): string {
    return join(this.bundleDir, this.root);
  }

  // typesDir is where ArtifactType definitions live; --types overrides it.
  typesDir(): string {
    return this.typesDirOverride !== "" ? this.typesDirOverride : join(this.rootDir(), this.types);
  }

  // resolveLink maps a root-relative link path (e.g. /work/task-014.md) to disk.
  resolveLink(p: string): string {
    return join(this.rootDir(), p.replace(/^\//, ""));
  }

  // linkEscapesRoot reports whether a resolved link path has climbed out of the
  // bundle root via ../ segments — such a target must be treated as unresolved,
  // otherwise an arbitrary on-disk file could satisfy traceability/cardinality.
  linkEscapesRoot(resolved: string): boolean {
    const rel = relative(this.rootDir(), resolved);
    return rel === ".." || rel.startsWith(".." + sep);
  }

  // linkKey canonicalizes a link target (as written) to the /root-relative key.
  linkKey(p: string): string {
    return "/" + toSlash(p.replace(/^\//, ""));
  }

  // rootRel computes the /root-relative key for an absolute artifact path.
  rootRel(abs: string): string {
    const rel = relative(this.rootDir(), abs);
    if (rel === "") return "";
    return "/" + toSlash(rel);
  }

  // bundleRel computes the bundle-relative, slash-separated path for findings.
  bundleRel(abs: string): string {
    const rel = relative(this.bundleDir, abs);
    return toSlash(rel === "" ? abs : rel);
  }
}

// load reads <bundleDir>/.ibuildos.yaml over the defaults. A missing file is not
// an error (defaults are returned). A present field — even an empty list —
// overrides its default; an omitted field keeps the default.
export function load(bundleDir: string): Config {
  const cfg = new Config();
  cfg.bundleDir = bundleDir;
  let raw: string;
  try {
    raw = readFileSync(join(bundleDir, ".ibuildos.yaml"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return cfg;
    throw e;
  }
  const fc = (yamlParse(raw) ?? {}) as Record<string, unknown>;
  if (typeof fc.root === "string") cfg.root = fc.root;
  if (typeof fc.types === "string") cfg.types = fc.types;
  if (Array.isArray(fc.artifacts)) cfg.artifacts = fc.artifacts.map(String);
  if (typeof fc.code_field === "string") cfg.chain.codeField = fc.code_field;

  const ch = fc.chain;
  if (ch && typeof ch === "object") {
    const c = ch as Record<string, unknown>;
    setStr(c.implements_rel, (v) => (cfg.chain.implementsRel = v));
    setStr(c.verifies_rel, (v) => (cfg.chain.verifiesRel = v));
    setStr(c.verified_by_rel, (v) => (cfg.chain.verifiedByRel = v));
    setStr(c.parent_rel, (v) => (cfg.chain.parentRel = v));
    setStr(c.code_field, (v) => (cfg.chain.codeField = v));
    setList(c.active_req_statuses, (v) => (cfg.chain.activeReqStatuses = v));
    setList(c.proposed_statuses, (v) => (cfg.chain.proposedStatuses = v));
    setList(c.done_statuses, (v) => (cfg.chain.doneStatuses = v));
    setList(c.passing_statuses, (v) => (cfg.chain.passingStatuses = v));
  }

  const pr = fc.profile;
  if (pr && typeof pr === "object") {
    const p = pr as Record<string, unknown>;
    setStr(p.name, (v) => (cfg.profile.name = v));
    setStr(p.version, (v) => (cfg.profile.version = v));
  }

  const tl = fc.tooling;
  if (tl && typeof tl === "object") {
    const t = tl as Record<string, unknown>;
    setStr(t.test, (v) => (cfg.tooling.test = v));
    setStr(t.staleness, (v) => (cfg.tooling.staleness = v));
    setList(t.lint, (v) => (cfg.tooling.lint = v));
    setList(t.source, (v) => (cfg.tooling.source = v));
  }

  const h = fc.harness;
  if (h && typeof h === "object") {
    const hc = h as Record<string, unknown>;
    setStr(hc.name, (v) => (cfg.harness.name = v));
    setStr(hc.command, (v) => (cfg.harness.command = v));
    setList(hc.args, (v) => (cfg.harness.args = v));
  }
  return cfg;
}

function setStr(v: unknown, set: (s: string) => void): void {
  if (typeof v === "string") set(v);
}

function setList(v: unknown, set: (a: string[]) => void): void {
  if (Array.isArray(v)) set(v.map(String));
}
