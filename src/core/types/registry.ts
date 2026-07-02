// The generic engine (Layer 1). Loads the self-describing ArtifactType
// definitions from docs/types/*.md, resolves inheritance, and compiles the
// friendly dialect into checks. Port of Go internal/types/registry.go.
//
// The ONLY literal type name in the whole engine is the string "ArtifactType",
// confined to this file (scripts/check-literals.ts enforces it).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { Collector } from "../model/model.ts";
import { parse as parseOkf } from "../okf/frontmatter.ts";
import { compilePattern } from "./pattern.ts";

// metaType is the only type the engine knows natively.
const metaType = "ArtifactType";

// reserved files in a types dir that are never type definitions.
const reserved = new Set(["index.md", "log.md"]);

// validScalarTypes are the field `type:` values the dialect understands.
const validScalarTypes = new Set(["", "string", "number", "date", "bool", "list"]);

export interface FieldSpec {
  required: boolean;
  oneOf: string[];
  pattern: string;
  type: string; // "" | string | number | date | bool | list
  doc: string;
  re: RegExp | null;
}

export interface RelSpec {
  target: string;
  min: number;
  max: number | null; // null = unbounded
  doc: string;
}

interface Definition {
  defines: string;
  extends: string;
  abstract: boolean;
  description: string;
  fields: Map<string, FieldSpec>;
  rels: Map<string, RelSpec>;
  jsonSchema: unknown | null; // plain JS object for ajv, null if absent
  path: string; // bundle-relative, for findings
  defLine: number;
}

// Resolved is a Definition flattened across its extends chain (child overrides parent).
export interface Resolved {
  name: string;
  abstract: boolean;
  fields: Map<string, FieldSpec>;
  rels: Map<string, RelSpec>;
  jsonSchemas: unknown[]; // own + ancestors (applied in addition)
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asStrList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export class Registry {
  private defs = new Map<string, Definition>();
  private resolvedCache = new Map<string, Resolved>();
  private desc = new Map<string, Set<string>>(); // type -> {self + transitive subtypes}

  // load reads every *.md under typesDir, compiles the type model, and
  // meta-validates it. Definition problems become error findings (via c). An
  // unreadable typesDir throws.
  static load(typesDir: string, bundleDir: string, c: Collector): Registry {
    const r = new Registry();
    const names = readdirSync(typesDir).sort();
    for (const name of names) r.loadOne(typesDir, bundleDir, name, c);
    r.checkReferences(c);
    r.buildDescendants();
    return r;
  }

  private loadOne(typesDir: string, bundleDir: string, name: string, c: Collector): void {
    if (reserved.has(name) || extname(name) !== ".md") return;
    const abs = join(typesDir, name);
    const rel = bundleRel(bundleDir, abs);
    let raw: string;
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    const [d, err] = parseOkf(abs, raw);
    if (err || !d.hasFrontmatter) return; // tolerate prose / malformed files
    const tv = d.get("type");
    if (!tv || asStr((tv.valNode as { value?: unknown }).value) !== metaType) return; // skip non-meta files

    const rd = d.toJS();
    const defines = asStr(rd.defines);
    if (defines === "") {
      c.errf(rel, d.frontStartLine(), "types.badMeta", "ArtifactType definition is missing a `defines` name");
      return;
    }
    const existing = this.defs.get(defines);
    if (existing) {
      c.errf(rel, d.frontStartLine(), "types.duplicate", `type ${q(defines)} is already defined in ${existing.path}`);
      return;
    }

    const def: Definition = {
      defines,
      extends: asStr(rd.extends),
      abstract: rd.abstract === true,
      description: asStr(rd.description),
      fields: new Map(),
      rels: new Map(),
      jsonSchema: rd.json_schema ?? null,
      path: rel,
      defLine: d.frontStartLine(),
    };

    const fields = asObj(rd.fields);
    for (const fname of Object.keys(fields)) {
      const rf = asObj(fields[fname]);
      const type = asStr(rf.type);
      const fs: FieldSpec = {
        required: rf.required === true,
        oneOf: asStrList(rf.one_of),
        pattern: asStr(rf.pattern),
        type,
        doc: asStr(rf.doc),
        re: null,
      };
      if (!validScalarTypes.has(type)) {
        c.errf(rel, def.defLine, "types.badMeta",
          `field ${q(fname)} in type ${q(defines)} has unknown type ${q(type)} (want string|number|date|bool|list)`);
      }
      if (fs.pattern !== "") {
        try {
          fs.re = compilePattern(fs.pattern);
        } catch (e) {
          c.errf(rel, def.defLine, "types.badPattern",
            `field ${q(fname)} in type ${q(defines)} has an invalid pattern ${q(fs.pattern)}: ${(e as Error).message}`);
        }
      }
      def.fields.set(fname, fs);
    }

    const rels = asObj(rd.relationships);
    for (const rname of Object.keys(rels)) {
      const rr = asObj(rels[rname]);
      const target = asStr(rr.target);
      if (target === "") {
        c.errf(rel, def.defLine, "types.badMeta",
          `relationship ${q(rname)} in type ${q(defines)} is missing a \`target\``);
      }
      def.rels.set(rname, {
        target,
        min: typeof rr.min === "number" ? rr.min : 0,
        max: typeof rr.max === "number" ? rr.max : null,
        doc: asStr(rr.doc),
      });
    }

    this.defs.set(defines, def);
  }

  // checkReferences validates that every extends / relationship target names a
  // defined type, and that the extends graph is acyclic.
  private checkReferences(c: Collector): void {
    for (const name of this.sortedDefNames()) {
      const def = this.defs.get(name)!;
      if (def.extends !== "" && !this.defs.has(def.extends)) {
        c.errf(def.path, def.defLine, "types.unknownExtends",
          `type ${q(name)} extends unknown type ${q(def.extends)}`);
      }
      for (const rname of [...def.rels.keys()].sort()) {
        const tgt = def.rels.get(rname)!.target;
        if (tgt !== "" && !this.defs.has(tgt)) {
          c.errf(def.path, def.defLine, "types.unknownTarget",
            `relationship ${q(rname)} in type ${q(name)} targets unknown type ${q(tgt)}`);
        }
      }
    }
    // cycle detection over extends (white/gray/black DFS)
    const White = 0, Gray = 1, Black = 2;
    const color = new Map<string, number>();
    const visit = (n: string): boolean => {
      color.set(n, Gray);
      const def = this.defs.get(n);
      if (def && def.extends !== "") {
        switch (color.get(def.extends) ?? White) {
          case Gray:
            c.errf(def.path, def.defLine, "types.cycle", `type ${q(n)} is part of an extends cycle`);
            return true;
          case White:
            if (visit(def.extends)) return true;
        }
      }
      color.set(n, Black);
      return false;
    };
    for (const name of this.sortedDefNames()) {
      if ((color.get(name) ?? White) === White) {
        if (visit(name)) break;
      }
    }
  }

  // ancestors returns the extends chain of name (self first, then parents),
  // guarding against cycles.
  private ancestorChain(name: string): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur = name;
    while (cur !== "") {
      if (seen.has(cur)) break;
      seen.add(cur);
      chain.push(cur);
      const def = this.defs.get(cur);
      if (!def) break;
      cur = def.extends;
    }
    return chain;
  }

  private buildDescendants(): void {
    for (const name of this.defs.keys()) {
      for (const anc of this.ancestorChain(name)) {
        let set = this.desc.get(anc);
        if (!set) {
          set = new Set();
          this.desc.set(anc, set);
        }
        set.add(name);
      }
    }
  }

  // resolve flattens a type across its extends chain (child overrides parent).
  resolve(name: string): Resolved | undefined {
    const cached = this.resolvedCache.get(name);
    if (cached) return cached;
    const def = this.defs.get(name);
    if (!def) return undefined;
    const res: Resolved = { name, abstract: def.abstract, fields: new Map(), rels: new Map(), jsonSchemas: [] };
    const chain = this.ancestorChain(name);
    // apply parents first so children override
    for (let i = chain.length - 1; i >= 0; i--) {
      const d = this.defs.get(chain[i]!);
      if (!d) continue;
      for (const [k, v] of d.fields) res.fields.set(k, v);
      for (const [k, v] of d.rels) res.rels.set(k, v);
      if (d.jsonSchema != null) res.jsonSchemas.push(d.jsonSchema);
    }
    this.resolvedCache.set(name, res);
    return res;
  }

  // satisfies reports whether docType is-or-transitively-extends target.
  satisfies(docType: string, target: string): boolean {
    return this.desc.get(target)?.has(docType) ?? false;
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  // concreteSubtypes returns the non-abstract types that are target or extend it,
  // sorted — used to suggest replacements when an abstract type is used directly.
  concreteSubtypes(name: string): string[] {
    const out: string[] = [];
    for (const sub of this.desc.get(name) ?? []) {
      const d = this.defs.get(sub);
      if (d && !d.abstract) out.push(sub);
    }
    return out.sort();
  }

  // relTargets returns every distinct target type declared for a relationship
  // name across all types, sorted. A capability predicate must accept is-or-
  // extends ANY of these, never just one — so this is order-independent.
  relTargets(relName: string): string[] {
    const set = new Set<string>();
    for (const name of this.sortedDefNames()) {
      const rel = this.defs.get(name)!.rels.get(relName);
      if (rel && rel.target !== "") set.add(rel.target);
    }
    return [...set].sort();
  }

  // satisfiesAny reports whether docType is-or-extends any of the targets — the
  // order-independent capability predicate built on the runtime type graph.
  satisfiesAny(docType: string, targets: string[]): boolean {
    return targets.some((t) => this.satisfies(docType, t));
  }

  defNames(): string[] {
    return this.sortedDefNames();
  }

  ancestors(name: string): string[] {
    return this.ancestorChain(name);
  }

  isAbstract(name: string): boolean {
    return this.defs.get(name)?.abstract ?? false;
  }

  description(name: string): string {
    return this.defs.get(name)?.description ?? "";
  }

  extendsOf(name: string): string {
    return this.defs.get(name)?.extends ?? "";
  }

  private sortedDefNames(): string[] {
    return [...this.defs.keys()].sort();
  }
}

function q(s: string): string {
  return JSON.stringify(s);
}

function bundleRel(bundleDir: string, abs: string): string {
  const rel = relative(bundleDir, abs);
  return (rel === "" ? abs : rel).replaceAll("\\", "/");
}
