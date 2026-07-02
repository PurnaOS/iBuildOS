// Layer 2a per-document checks against the resolved type. Port of Go
// internal/validate/document.go.
import Ajv from "ajv";
import { Collector } from "../model/model.ts";
import type { Registry, FieldSpec } from "../types/registry.ts";
import { scalarText, isEmptyScalar, nodeIsScalar, nodeIsSeq, seqItems } from "../okf/frontmatter.ts";
import { type Artifact, contains } from "./validate.ts";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
// numberRe is the set of scalar forms that are valid YAML numbers (rejects the
// Inf/NaN/hex/underscore forms a bare parse would accept).
const numberRe = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;

export function validateDoc(a: Artifact, reg: Registry, c: Collector): void {
  if (!a.doc || !a.doc.hasFrontmatter) {
    c.errf(a.path, 0, "doc.noType", "artifact has no YAML frontmatter; add a --- block with at least a `type`");
    return;
  }
  // Duplicate keys are tolerated (last wins) but surfaced so the silent loss is visible.
  for (const k of a.doc.duplicateTopLevelKeys()) {
    c.warnf(a.path, a.doc.frontStartLine(), "doc.duplicateKey",
      `frontmatter key ${q(k)} appears more than once; only one value is used`);
  }
  for (const r of a.doc.duplicateLinkRels()) {
    c.warnf(a.path, a.doc.frontStartLine(), "doc.duplicateRelationship",
      `relationship ${q(r)} appears more than once under links:; only one is used`);
  }
  if (a.typ === "") {
    c.errf(a.path, a.doc.frontStartLine(), "doc.noType", "artifact frontmatter has no `type`");
    return;
  }
  const res = reg.resolve(a.typ);
  if (!res) {
    const tv = a.doc.get("type");
    c.warnf(a.path, a.doc.line(tv?.valNode), "doc.unknownType",
      `type ${q(a.typ)} is not defined in the type model; tolerated, not validated`);
    return;
  }
  if (res.abstract) {
    const tv = a.doc.get("type");
    c.errf(a.path, a.doc.line(tv?.valNode), "doc.abstractType",
      `type ${q(a.typ)} is abstract and may not be used directly; use a concrete subtype: ${reg.concreteSubtypes(a.typ).join(", ")}`);
    return;
  }
  for (const name of [...res.fields.keys()].sort()) {
    checkField(a, name, res.fields.get(name)!, c);
  }
  if (res.jsonSchemas.length > 0) validateJSONSchemas(a, res.jsonSchemas, c);
}

function checkField(a: Artifact, name: string, fs: FieldSpec, c: Collector): void {
  const g = a.doc!.get(name);
  if (!g) {
    if (fs.required) c.errf(a.path, a.doc!.frontStartLine(), "field.required", `required field ${q(name)} is missing`);
    return;
  }
  const vn = g.valNode;
  const line = a.doc!.line(g.keyNode);

  // A present-but-empty scalar does not satisfy required.
  if (fs.required && isEmptyScalar(vn)) {
    c.errf(a.path, line, "field.required", `required field ${q(name)} is present but empty`);
    return;
  }

  if (fs.type === "list") {
    if (!nodeIsSeq(vn)) {
      c.errf(a.path, line, "field.type", `field ${q(name)} must be a list`);
      return;
    }
    for (const item of seqItems(vn)) {
      if (!nodeIsScalar(item)) {
        c.errf(a.path, line, "field.type", `field ${q(name)} must be a list of simple values`);
        return;
      }
    }
    return; // enum/pattern do not apply to lists in this dialect
  }

  if (!nodeIsScalar(vn)) {
    c.errf(a.path, line, "field.type", `field ${q(name)} must be a single value`);
    return;
  }
  const text = scalarText(vn); // raw source text — never the decoded value
  switch (fs.type) {
    case "number":
      if (!isNumber(text)) c.errf(a.path, line, "field.type", `field ${q(name)} must be a number, got ${q(text)}`);
      break;
    case "bool":
      if (!isBool(text)) c.errf(a.path, line, "field.type", `field ${q(name)} must be true or false, got ${q(text)}`);
      break;
    case "date":
      if (!isDate(text)) c.errf(a.path, line, "field.type", `field ${q(name)} must be a date (YYYY-MM-DD), got ${q(text)}`);
      break;
  }
  if (fs.oneOf.length > 0 && !contains(fs.oneOf, text)) {
    c.errf(a.path, line, "field.enum", `field ${q(name)} value ${q(text)} is not one of: ${fs.oneOf.join(", ")}`);
  }
  if (fs.re && !fs.re.test(text)) {
    c.errf(a.path, line, "field.pattern", `field ${q(name)} value ${q(text)} does not match required form ${q(fs.pattern)}`);
  }
}

function isNumber(s: string): boolean {
  if (!numberRe.test(s)) return false;
  return Number.isFinite(Number(s));
}

function isBool(s: string): boolean {
  const l = s.toLowerCase();
  return l === "true" || l === "false";
}

function isDate(s: string): boolean {
  if (!dateRe.test(s)) return false;
  // reject impossible calendar dates (e.g. 2026-13-45) via a round-trip.
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = s.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

// validateJSONSchemas applies any json_schema: escape-hatch blocks (own +
// ancestors) to the document's frontmatter, in addition to the dialect checks.
// The instance is the raw-scalar view of the frontmatter: under YAML's core
// schema, dates/strings keep their text while numbers/bools resolve native, so
// `a.doc.toJS()` is already that view.
function validateJSONSchemas(a: Artifact, schemas: unknown[], c: Collector): void {
  if (!a.doc || !a.doc.map) return;
  const inst = a.doc.toJS();
  for (const schema of schemas) {
    let validateFn: ReturnType<Ajv["compile"]>;
    try {
      validateFn = new Ajv({ allErrors: true, strict: false }).compile(schema as object);
    } catch (e) {
      c.errf(a.path, a.doc.frontStartLine(), "doc.jsonSchema", `invalid json_schema: ${stableSchemaError([(e as Error).message])}`);
      continue;
    }
    if (!validateFn(inst)) {
      const lines = (validateFn.errors ?? []).map((e) => `${e.instancePath} ${e.keyword} ${e.message ?? ""}`);
      c.errf(a.path, a.doc.frontStartLine(), "doc.jsonSchema", `frontmatter fails json_schema: ${stableSchemaError(lines)}`);
    }
  }
}

// stableSchemaError renders schema errors as a single deterministic line: the
// validator's error order can vary, which would break byte-identical output, so
// we normalize whitespace, dedupe, sort, and join.
export function stableSchemaError(rawLines: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of rawLines) {
    for (const ln0 of raw.split("\n")) {
      const ln = ln0.split(/\s+/).filter(Boolean).join(" ");
      if (ln === "" || seen.has(ln)) continue;
      seen.add(ln);
      parts.push(ln);
    }
  }
  parts.sort();
  return parts.join("; ");
}

function q(s: string): string {
  return JSON.stringify(s);
}
