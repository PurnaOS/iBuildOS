// Renders an authoring template for an artifact type, derived entirely from the
// registry — a read-only projection (the deterministic-core analog of `graph`),
// with no findings, no AI, and no taxonomy literal: the type name is an argument.
// Port of Go internal/instructions.
import type { Registry, FieldSpec, RelSpec } from "../types/registry.ts";

interface FieldOut { name: string; required: boolean; type: string; oneOf: string[]; pattern: string; doc: string }
interface RelOut { name: string; target: string; min: number; max: number | null; doc: string }
interface TypeOut { name: string; description: string; extends: string; abstract: boolean; fields: FieldOut[]; links: RelOut[] }

function project(reg: Registry, name: string): TypeOut {
  const res = reg.resolve(name)!;
  const out: TypeOut = {
    name, description: reg.description(name), extends: reg.extendsOf(name), abstract: reg.isAbstract(name), fields: [], links: [],
  };
  for (const fn of [...res.fields.keys()].sort()) {
    const f: FieldSpec = res.fields.get(fn)!;
    out.fields.push({ name: fn, required: f.required, type: f.type, oneOf: f.oneOf, pattern: f.pattern, doc: f.doc });
  }
  for (const rn of [...res.rels.keys()].sort()) {
    const r: RelSpec = res.rels.get(rn)!;
    out.links.push({ name: rn, target: r.target, min: r.min, max: r.max, doc: r.doc });
  }
  return out;
}

function cardinality(min: number, max: number | null): string {
  return `(${min}..${max == null ? "*" : max})`;
}

function fieldHint(f: FieldOut): string {
  if (f.oneOf.length > 0) return "one of: " + f.oneOf.join(" | ");
  if (f.pattern !== "") return "pattern " + f.pattern;
  if (f.type !== "" && f.type !== "string") return f.type;
  return "";
}

function fieldDefault(f: FieldOut): string {
  if (f.oneOf.length > 0) return " " + f.oneOf[0] + "   # one of: " + f.oneOf.join(" | ");
  if (f.pattern !== "") return "   # " + f.pattern;
  if (f.type === "list") return " []";
  return "";
}

function table(rows: string[][]): string {
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.length)));
  return rows.map((r) => "  " + r.map((c, i) => (i < r.length - 1 ? c.padEnd(widths[i]!) : c)).join("  ").trimEnd()).join("\n");
}

function jsonOut(out: unknown): string {
  return JSON.stringify(out, null, 2) + "\n";
}

// write renders instructions for typeName (or all types when "") as text or json.
export function write(reg: Registry, typeName: string, format: string): string {
  if (typeName === "") {
    if (format === "json") {
      return jsonOut(reg.defNames().map((name) => ({ name, description: reg.description(name), extends: reg.extendsOf(name) || undefined, abstract: reg.isAbstract(name) })));
    }
    const rows = reg.defNames().map((name) => [name, reg.isAbstract(name) ? "(abstract)" : "", reg.description(name)]);
    return "Defined artifact types (run `iBuild instructions <Type>` for one):\n\n" + table(rows) + "\n";
  }
  if (!reg.has(typeName)) {
    throw new Error(`unknown type ${JSON.stringify(typeName)} (run \`iBuild instructions\` to list defined types)`);
  }
  const out = project(reg, typeName);
  if (format === "json") {
    return jsonOut({
      name: out.name, description: out.description || undefined, extends: out.extends || undefined, abstract: out.abstract,
      fields: out.fields.map((f) => ({ name: f.name, required: f.required, type: f.type || undefined, one_of: f.oneOf.length ? f.oneOf : undefined, pattern: f.pattern || undefined, doc: f.doc || undefined })),
      links: out.links.map((r) => ({ name: r.name, target: r.target, min: r.min, max: r.max ?? undefined, doc: r.doc || undefined })),
    });
  }

  let b = out.name + (out.description ? ` — ${out.description}` : "") + "\n";
  if (out.extends) b += `extends ${out.extends}\n`;
  if (out.abstract) b += `\nABSTRACT — cannot be authored directly. Use one of: ${reg.concreteSubtypes(out.name).join(", ")}\n`;

  b += "\nFields:\n" + table(out.fields.map((f) => [f.name, f.required ? "required" : "", fieldHint(f), f.doc])) + "\n";
  if (out.links.length > 0) {
    b += "\nLinks:\n" + table(out.links.map((r) => [r.name, `→ ${r.target}`, cardinality(r.min, r.max), r.doc])) + "\n";
  }
  if (!out.abstract) {
    b += "\nTemplate:\n  ---\n  type: " + out.name + "\n";
    for (const f of out.fields) b += `  ${f.name}:${fieldDefault(f)}\n`;
    if (out.links.length > 0) {
      b += "  links:\n";
      for (const r of out.links) b += `    ${r.name}: []  # → ${r.target} ${cardinality(r.min, r.max)}\n`;
    }
    b += "  ---\n";
  }
  return b;
}
