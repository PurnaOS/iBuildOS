// The OKF substrate: a hand-written frontmatter splitter over the `yaml` AST.
// Knows nothing about the SDLC taxonomy — only markdown + YAML frontmatter.
// Port of Go internal/okf/frontmatter.go.
//
// Line numbers: the `yaml` package gives byte ranges, not line numbers, so we
// parse the front block in isolation with a LineCounter and convert range[0] ->
// 1-based line, then re-base by frontStart (exactly as Go did node.Line+start-1).
// `uniqueKeys: false` keeps duplicate keys in document order so we can detect the
// silent-shadowing the validator warns about (Go walked the node Content slice).
import { parseDocument, LineCounter, isMap, isScalar, isSeq, isAlias, YAMLMap } from "yaml";
import type { Node, Document as YamlAst } from "yaml";

export class UnterminatedError extends Error {
  constructor() {
    super("frontmatter: opening --- without a closing fence");
    this.name = "UnterminatedError";
  }
}

export interface LinkRef {
  raw: string;
  line: number;
}

export interface SplitResult {
  front: string | null;
  body: string;
  frontStartLine: number;
  ok: boolean;
  err: Error | null;
}

function trimRightWS(s: string): string {
  return s.replace(/[ \t\r]+$/, "");
}

// split separates a leading `--- ... ---` YAML frontmatter block from the body.
// The opening fence must be the very first line (after an optional BOM). Returns
// ok=false (no error) when there is no opening fence, and an UnterminatedError
// when the opener has no closer.
export function split(raw: string | Uint8Array): SplitResult {
  let s = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  if (s.startsWith("﻿")) s = s.slice(1); // strip UTF-8 BOM
  s = s.replaceAll("\r\n", "\n").replaceAll("\r", "\n"); // normalize CRLF / lone CR
  const lines = s.split("\n");
  if (lines.length === 0 || trimRightWS(lines[0]!) !== "---") {
    return { front: null, body: s, frontStartLine: 0, ok: false, err: null };
  }
  for (let i = 1; i < lines.length; i++) {
    if (trimRightWS(lines[i]!) === "---") {
      return {
        front: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        frontStartLine: 2,
        ok: true,
        err: null,
      };
    }
  }
  return { front: null, body: s, frontStartLine: 0, ok: false, err: new UnterminatedError() };
}

// Document is a parsed OKF concept: its frontmatter mapping plus body.
export class Document {
  readonly path: string;
  hasFrontmatter = false;
  body: string;
  private frontStart: number;
  private lc: LineCounter | null = null;
  private ast: YamlAst | null = null;
  map: YAMLMap | null = null; // frontmatter mapping node, null when hasFrontmatter is false

  constructor(path: string, body: string, frontStart: number) {
    this.path = path;
    this.body = body;
    this.frontStart = frontStart;
  }

  // line maps a YAML node to a 1-based line in the original file. 0 for nil.
  line(n: Node | null | undefined): number {
    if (!n || this.frontStart === 0 || !this.lc) return 0;
    const r = n.range;
    if (!r) return 0;
    return this.lc.linePos(r[0]).line + this.frontStart - 1;
  }

  // frontStartLine is the file line of the first frontmatter content line (2 for a
  // well-formed file) — the fallback location for "missing key" findings.
  frontStartLine(): number {
    return this.frontStart;
  }

  // get returns the key and value nodes for a top-level frontmatter key (first
  // occurrence, matching Go's Content walk).
  get(key: string): { keyNode: Node; valNode: Node } | undefined {
    if (!this.map) return undefined;
    for (const pair of this.map.items) {
      const k = pair.key as Node;
      if (isScalar(k) && String(k.value) === key) {
        return { keyNode: k, valNode: pair.value as Node };
      }
    }
    return undefined;
  }

  // keys returns the top-level frontmatter keys in document order.
  keys(): string[] {
    if (!this.map) return [];
    return this.map.items.map((p) => String((p.key as { value?: unknown }).value));
  }

  // toJS converts the frontmatter mapping to a plain JS object (decoded values).
  toJS(): Record<string, unknown> {
    if (!this.map || this.map.items.length === 0) return {};
    return this.map.toJS(this.ast!) as Record<string, unknown>;
  }

  private scalarRef(item: Node | null): LinkRef | null {
    if (!item) return null;
    if (isAlias(item)) {
      const target = item.resolve(this.ast!);
      if (!target || !isScalar(target) || target.value === "" || target.value == null) return null;
      return { raw: String(target.value), line: this.line(item) };
    }
    if (isScalar(item) && item.value !== "" && item.value != null) {
      return { raw: String(item.value), line: this.line(item) };
    }
    return null;
  }

  // links reads the `links:` block: relationship name -> list of root-relative
  // path targets, each carrying its source line.
  links(): Record<string, LinkRef[]> {
    const res: Record<string, LinkRef[]> = {};
    const g = this.get("links");
    if (!g || !isMap(g.valNode)) return res;
    for (const pair of g.valNode.items) {
      const rel = String((pair.key as { value?: unknown }).value);
      const val = pair.value as Node;
      const refs: LinkRef[] = [];
      if (isSeq(val)) {
        for (const item of val.items) {
          const sr = this.scalarRef(item as Node);
          if (sr) refs.push(sr);
        }
      } else if (isScalar(val)) {
        if (val.value !== "" && val.value != null) refs.push({ raw: String(val.value), line: this.line(val) });
      } else if (isAlias(val)) {
        const sr = this.scalarRef(val);
        if (sr) refs.push(sr);
      }
      res[rel] = refs;
    }
    return res;
  }

  duplicateTopLevelKeys(): string[] {
    if (!this.map) return [];
    return dupKeys(this.map.items.map((p) => String((p.key as { value?: unknown }).value)));
  }

  duplicateLinkRels(): string[] {
    const g = this.get("links");
    if (!g || !isMap(g.valNode)) return [];
    return dupKeys(g.valNode.items.map((p) => String((p.key as { value?: unknown }).value)));
  }

  // _attach wires the parsed AST + line counter (used by parse()).
  _attach(ast: YamlAst, lc: LineCounter, map: YAMLMap): void {
    this.ast = ast;
    this.lc = lc;
    this.map = map;
    this.hasFrontmatter = true;
  }
}

// --- node accessors (keep the `yaml` dependency localized to okf) ---

export type ValueNode = Node;

export function nodeIsScalar(n: Node | null | undefined): boolean {
  return !!n && isScalar(n);
}

export function nodeIsSeq(n: Node | null | undefined): boolean {
  return !!n && isSeq(n);
}

export function seqItems(n: Node | null | undefined): Node[] {
  return n && isSeq(n) ? (n.items as Node[]) : [];
}

// scalarText returns a scalar's value with Go's yaml.Node.Value parity: the
// unquoted string content for strings, and the raw source token for
// numbers/bools/dates (so a number field sees the text the author wrote). Empty
// string for a non-scalar, empty, or null node.
export function scalarText(n: Node | null | undefined): string {
  if (!n || !isScalar(n)) return "";
  const v = n.value;
  if (typeof v === "string") return v;
  if (v == null) return "";
  const src = (n as { source?: unknown }).source;
  return typeof src === "string" ? src : String(v);
}

// isEmptyScalar reports a present-but-empty scalar (blank value or explicit
// null) — does not satisfy a required field.
export function isEmptyScalar(n: Node | null | undefined): boolean {
  return !!n && isScalar(n) && (n.value === "" || n.value == null);
}

function dupKeys(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const out: string[] = [];
  for (const [k, n] of counts) if (n > 1) out.push(k);
  out.sort();
  return out;
}

function kindName(n: Node): string {
  if (isSeq(n)) return "list";
  if (isScalar(n)) return "scalar";
  if (isMap(n)) return "mapping";
  return "value";
}

// parse splits and YAML-decodes a file. A document with no frontmatter is not an
// error (hasFrontmatter is false) — this is how reserved/prose files are tolerated.
// Returns [doc, err]; err mirrors Go's (d, error) return for a malformed block.
export function parse(path: string, raw: string | Uint8Array): [Document, Error | null] {
  const sr = split(raw);
  const d = new Document(path, sr.body, sr.frontStartLine);
  if (sr.err) return [d, sr.err];
  if (!sr.ok || sr.front === null) return [d, null];

  const lc = new LineCounter();
  const ast = parseDocument(sr.front, { lineCounter: lc, uniqueKeys: false });
  const fatal = ast.errors[0];
  if (fatal) return [d, new Error(`frontmatter: ${fatal.message}`)];

  const contents = ast.contents;
  if (contents == null) {
    d._attach(ast, lc, new YAMLMap()); // empty frontmatter -> empty mapping
  } else if (isMap(contents)) {
    d._attach(ast, lc, contents);
  } else {
    return [d, new Error(`frontmatter: expected a mapping, got ${kindName(contents as Node)}`)];
  }
  return [d, null];
}
