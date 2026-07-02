// Compiles a dialect pattern into an anchored full-match RegExp. Port of Go
// internal/types/pattern.go.
//
//   "regex:<raw>" -> the remainder used verbatim
//   otherwise     -> friendly tokens expanded; literal runs regexp-escaped
//
// Tokens: <number> -> [0-9]+ , <slug> -> [a-z0-9]+(?:-[a-z0-9]+)* , <date> -> \d{4}-\d{2}-\d{2}
// An unknown <token> throws rather than silently matching literally.
//
// <date> is a SHAPE check only (accepts impossible calendar dates like
// 2026-13-45); use `type: date` for real calendar validation — they disagree by
// design. The result is anchored to a full match. JS `$` (no `m` flag) asserts
// absolute end-of-input — no trailing newline — so ^(?:…)$ is the faithful
// equivalent of Go's \A(?:…)\z. A raw "regex:" body is compiled standalone first
// so an unbalanced group is rejected instead of escaping the wrapper.

// quoteMeta escapes the same metacharacters as Go's regexp.QuoteMeta.
function quoteMeta(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compilePattern(pattern: string): RegExp {
  let body: string;
  if (pattern.startsWith("regex:")) {
    const rest = pattern.slice("regex:".length);
    // Validate the raw body in isolation so a structurally-unbalanced body
    // can't break out of our own ^(?:…)$ wrapper and defeat full-match.
    new RegExp("(?:" + rest + ")"); // throws on invalid
    body = rest;
  } else {
    let b = "";
    let i = 0;
    while (i < pattern.length) {
      if (pattern[i] === "<") {
        const end = pattern.slice(i).indexOf(">");
        if (end >= 0) {
          const tok = pattern.slice(i, i + end + 1);
          switch (tok) {
            case "<number>":
              b += "[0-9]+";
              break;
            case "<slug>":
              b += "[a-z0-9]+(?:-[a-z0-9]+)*";
              break;
            case "<date>":
              b += "\\d{4}-\\d{2}-\\d{2}";
              break;
            default:
              throw new Error(`unknown pattern token ${JSON.stringify(tok)}`);
          }
          i += end + 1;
          continue;
        }
      }
      if (pattern[i] === "<") {
        b += quoteMeta("<"); // unmatched '<' (no '>'): emit literal, advance
        i++;
        continue;
      }
      const next = pattern.slice(i).indexOf("<");
      if (next < 0) {
        b += quoteMeta(pattern.slice(i));
        break;
      }
      b += quoteMeta(pattern.slice(i, i + next));
      i += next;
    }
    body = b;
  }
  return new RegExp("^(?:" + body + ")$");
}
