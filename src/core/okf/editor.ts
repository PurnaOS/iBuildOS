// A minimal, deterministic, line-based YAML-frontmatter editor. It operates only
// on the leading `--- ... ---` block and preserves every other byte (body,
// trailing newline, comments, ordering, EOL style). NOT a general YAML editor —
// it understands exactly the two shapes the Studio needs: top-level scalar keys
// and the nested `links:` mapping of relationship → inline/block sequence. That
// narrow scope keeps edits mechanical and the post-state byte-identical to a hand
// commit. Port of the legacy Go fmEditor (serve/editor.go).

export class FrontmatterEditor {
  private pre: string[];
  private fm: string[];
  private post: string[];
  private eol: string;
  private final: string;

  constructor(raw: string) {
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const norm = raw.replaceAll("\r\n", "\n");
    const parts = norm.split("\n");
    // The last element after split is the text after the final "\n" (empty when
    // the file ends in a newline) — remember it so a no-trailing-newline file
    // round-trips exactly.
    const final = parts.length > 0 ? parts[parts.length - 1]! : "";
    const lines = parts.slice(0, -1);
    if (lines.length === 0 || lines[0]!.replace(/[ \t]+$/, "") !== "---") {
      throw new Error("file has no YAML frontmatter fence to edit");
    }
    let closeIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]!.replace(/[ \t]+$/, "") === "---") {
        closeIdx = i;
        break;
      }
    }
    if (closeIdx < 0) throw new Error("frontmatter fence is never closed");
    this.pre = [lines[0]!];
    this.fm = lines.slice(1, closeIdx);
    this.post = lines.slice(closeIdx);
    this.eol = eol;
    this.final = final;
  }

  // text reassembles the file with the same EOL style + trailing fragment.
  text(): string {
    const all = [...this.pre, ...this.fm, ...this.post];
    let joined = all.join("\n");
    if (joined !== "") joined += "\n";
    joined += this.final;
    if (this.eol === "\r\n") joined = joined.replaceAll("\n", "\r\n");
    return joined;
  }

  // setScalar replaces a top-level scalar key's value, or appends `key: value`.
  setScalar(key: string, value: string): void {
    const idx = this.topLevelKeyLine(key);
    if (idx < 0) {
      this.fm.push(`${key}: ${yamlScalar(value)}`);
      return;
    }
    const indent = leadingWS(this.fm[idx]!);
    this.fm[idx] = `${indent}${key}: ${yamlScalar(value)}`;
  }

  // addLink inserts `to` into the `rel` sequence under top-level `links:`,
  // creating the block / relationship as needed (idempotent).
  addLink(rel: string, to: string): void {
    const linksIdx = this.topLevelKeyLine("links");
    if (linksIdx < 0) {
      this.fm.push("links:", `  ${rel}: [${to}]`);
      return;
    }
    const linksIndent = leadingWS(this.fm[linksIdx]!).length;
    let childIndent = -1;
    let relIdx = -1;
    let end = this.fm.length;
    for (let i = linksIdx + 1; i < this.fm.length; i++) {
      const line = this.fm[i]!;
      if (line.trim() === "") continue;
      const ind = leadingWS(line).length;
      if (ind <= linksIndent) {
        end = i;
        break;
      }
      if (childIndent < 0) childIndent = ind;
      if (ind === childIndent && topKeyOf(line) === rel) relIdx = i;
    }
    if (childIndent < 0) childIndent = linksIndent + 2;
    const indent = " ".repeat(childIndent);
    if (relIdx < 0) {
      this.fm = insertLine(this.fm, end, `${indent}${rel}: [${to}]`);
      return;
    }
    this.appendToSequence(relIdx, childIndent, to);
  }

  private appendToSequence(relIdx: number, relIndent: number, to: string): void {
    const line = this.fm[relIdx]!;
    const { value } = splitKeyValue(line);
    const trimmed = value.trim();

    let itemIndent = -1;
    let insertAt = relIdx + 1;
    for (let i = relIdx + 1; i < this.fm.length; i++) {
      const l = this.fm[i]!;
      if (l.trim() === "") continue;
      if (leadingWS(l).length <= relIndent) break;
      if (l.trim().startsWith("-")) {
        if (itemIndent < 0) itemIndent = leadingWS(l).length;
        if (l.trim().replace(/^-/, "").trim() === to) return; // idempotent
        insertAt = i + 1;
      }
    }

    if (itemIndent >= 0) {
      this.fm = insertLine(this.fm, insertAt, `${" ".repeat(itemIndent)}- ${to}`);
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const items = splitInlineItems(trimmed.slice(1, -1));
      if (items.includes(to)) return; // idempotent
      items.push(to);
      this.fm[relIdx] = `${" ".repeat(relIndent)}${topKeyOf(line)}: [${items.join(", ")}]`;
    } else if (trimmed === "") {
      this.fm[relIdx] = `${" ".repeat(relIndent)}${topKeyOf(line)}: [${to}]`;
    } else {
      this.fm[relIdx] = `${" ".repeat(relIndent)}${topKeyOf(line)}: [${trimmed}, ${to}]`;
    }
  }

  private topLevelKeyLine(key: string): number {
    for (let i = 0; i < this.fm.length; i++) {
      if (leadingWS(this.fm[i]!).length !== 0) continue;
      if (topKeyOf(this.fm[i]!) === key) return i;
    }
    return -1;
  }
}

function leadingWS(s: string): string {
  const m = s.match(/^[ \t]*/);
  return m ? m[0] : "";
}

function topKeyOf(line: string): string {
  const t = line.replace(/^[ \t]+/, "");
  if (t.startsWith("#") || t.startsWith("-")) return "";
  const idx = t.indexOf(":");
  return idx < 0 ? "" : t.slice(0, idx).trim();
}

function splitKeyValue(line: string): { key: string; value: string } {
  const t = line.replace(/^[ \t]+/, "");
  const idx = t.indexOf(":");
  if (idx < 0) return { key: t.trim(), value: "" };
  return { key: t.slice(0, idx).trim(), value: t.slice(idx + 1) };
}

function splitInlineItems(inner: string): string[] {
  if (inner.trim() === "") return [];
  return inner.split(",").map((p) => p.trim()).filter(Boolean);
}

function insertLine(lines: string[], at: number, line: string): string[] {
  const i = Math.max(0, Math.min(at, lines.length));
  return [...lines.slice(0, i), line, ...lines.slice(i)];
}

function yamlScalar(v: string): string {
  if (v === "") return `""`;
  if (needsQuote(v)) return `"${v.replaceAll('"', '\\"')}"`;
  return v;
}

function needsQuote(v: string): boolean {
  if (v !== v.trim()) return true;
  if (["true", "false", "null", "yes", "no", "~"].includes(v)) return true;
  if (/[:#{}\[\],&*!|>'"%@`]/.test(v)) return true;
  return /^[0-9]+$/.test(v); // keep purely-numeric strings as strings
}
