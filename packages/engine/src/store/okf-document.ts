import { CST, Parser, parseDocument } from "yaml";

// The OKF store (T-007): parse/serialize markdown + YAML frontmatter with
// round-trip fidelity. FORMATS.md §1 mandates LF + UTF-8; this module enforces
// LF on parse rather than silently normalizing (normalizing would itself be a
// formatting-changing operation the caller didn't ask for).
//
// This operates at the `yaml` package's CST layer, not its higher-level
// `Document` API: `Document#toString()` re-stringifies the whole map from its
// resolved node tree and reformats things it didn't touch (comment spacing,
// flow-collection bracket padding, …) — confirmed empirically against a
// fixture with hand-aligned comments. The CST layer instead retains each
// token's original source text verbatim and `CST.setScalarValue` mutates only
// the targeted token in place, so `CST.stringify` reproduces everything else
// byte-for-byte (TECH-STACK.md T-007/G-41's "CST setScalarValue" clause).

const DELIMITER = "---";

export class OkfParseError extends Error {}

export interface OkfDocument {
  /** The raw CST tokens for the frontmatter YAML (one `document` token, in
   * practice, for a single-document frontmatter block). Mutate via
   * `setScalarField`; reserialize via `serializeOkfDocument`. */
  cstTokens: CST.Token[];
  /** Everything after the closing `---` delimiter, verbatim. */
  body: string;
  /** Read-only plain-JS view of the frontmatter, refreshed after each edit. */
  frontmatter: Record<string, unknown>;
}

function toPlainObject(cstTokens: CST.Token[]): Record<string, unknown> {
  const yamlText = cstTokens.map((t) => CST.stringify(t)).join("");
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) {
    throw new OkfParseError(
      `frontmatter YAML parse error: ${doc.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return (doc.toJS() ?? {}) as Record<string, unknown>;
}

export function parseOkfDocument(raw: string): OkfDocument {
  if (raw.includes("\r\n")) {
    throw new OkfParseError("OKF documents must use LF line endings, found CRLF");
  }

  const lines = raw.split("\n");
  if (lines[0] !== DELIMITER) {
    throw new OkfParseError("OKF document must open with a `---` frontmatter delimiter");
  }
  const closeIdx = lines.findIndex((line, i) => i > 0 && line === DELIMITER);
  if (closeIdx === -1) {
    throw new OkfParseError("OKF document frontmatter is not closed with a `---` delimiter");
  }

  const yamlText = `${lines.slice(1, closeIdx).join("\n")}\n`;
  const body = lines.slice(closeIdx + 1).join("\n");

  const cstTokens = [...new Parser().parse(yamlText)];

  return {
    cstTokens,
    body,
    frontmatter: toPlainObject(cstTokens),
  };
}

export function serializeOkfDocument(doc: OkfDocument): string {
  const yamlText = doc.cstTokens.map((t) => CST.stringify(t)).join("");
  return `${DELIMITER}\n${yamlText}${DELIMITER}\n${doc.body}`;
}

function rootMap(doc: OkfDocument): CST.BlockMap {
  const docToken = doc.cstTokens.find(
    (t): t is CST.Document => t.type === "document",
  );
  const root = docToken ? docToken.value : doc.cstTokens.find((t) => t.type === "block-map");
  if (!root || root.type !== "block-map") {
    throw new OkfParseError("frontmatter root is not a block mapping");
  }
  return root;
}

function findMapItem(map: CST.BlockMap | CST.FlowCollection, key: string) {
  const item = map.items.find((it) => it.key && CST.resolveAsScalar(it.key)?.value === key);
  if (!item || !item.value) {
    throw new OkfParseError(`no such frontmatter key: "${key}"`);
  }
  return item;
}

/**
 * Scalar value edit — change one frontmatter field (optionally nested one
 * level, e.g. `["generated", "by"]`) to a new scalar value. Mutates only the
 * targeted CST token, so the resulting diff touches exactly that value's
 * line and nothing else (proven in okf-document.test.ts).
 *
 * Structural edits (adding a brand-new field, removing one, appending to a
 * sequence) need a separate owned token-splice layer — TECH-STACK.md (T-007,
 * G-41) calls this out explicitly as further work; out of scope here.
 */
export function setScalarField(
  doc: OkfDocument,
  path: string | string[],
  value: string,
): void {
  const keys = Array.isArray(path) ? path : [path];
  if (keys.length === 0) {
    throw new OkfParseError("setScalarField requires at least one key");
  }

  let current: CST.BlockMap | CST.FlowCollection = rootMap(doc);
  for (let i = 0; i < keys.length - 1; i++) {
    const item = findMapItem(current, keys[i]!);
    const next = item.value!;
    if (next.type !== "block-map" && next.type !== "flow-collection") {
      throw new OkfParseError(`frontmatter key "${keys[i]}" is not a mapping`);
    }
    current = next;
  }

  const leafKey = keys[keys.length - 1]!;
  const item = findMapItem(current, leafKey);
  CST.setScalarValue(item.value!, value);

  doc.frontmatter = toPlainObject(doc.cstTokens);
}
