import { resolveSeverity, type Finding } from "@ibuildos/schemas";

// FORMATS.md §6 — `sec/committed-secret`: high-entropy/known-pattern secrets in
// tracked files + known keychain values. This is a first pass, pragmatic scan —
// not a full secret-scanning product — over an artifact's frontmatter (stringified)
// and body text. Pure and dependency-injected: the caller supplies the text, this
// module does no filesystem/network I/O.

interface KnownSecretPattern {
  /** Used as the finding's `subject` — names *which* shape matched. */
  id: string;
  pattern: RegExp;
}

// A few common, high-signal shapes. Global flag so each occurrence is found.
const KNOWN_SECRET_PATTERNS: KnownSecretPattern[] = [
  { id: "openai-style-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { id: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
];

// A generic base64-ish blob (>=32 chars, optional `=` padding) sitting next to a
// suspicious key name (token/secret/key/password/...) on the same line — catches
// the "someone pasted a raw credential under an obvious key" shape without trying
// to be a general entropy detector.
const SUSPICIOUS_KEY_VALUE = new RegExp(
  String.raw`\b(token|secret|key|password|apikey|api_key|access_key)\b\s*[:=]\s*["']?([A-Za-z0-9+/]{32,}={0,2})["']?`,
  "gi",
);

function findAll(pattern: RegExp, text: string): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(m);
    if (m[0].length === 0) re.lastIndex++; // guard against zero-width infinite loop
  }
  return matches;
}

/**
 * Scan an artifact's frontmatter + body for likely committed secrets.
 * `body` defaults to "" so callers with frontmatter-only artifacts don't need
 * to pass anything.
 */
export function checkCommittedSecret(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  body = "",
): Finding[] {
  const findings: Finding[] = [];
  const text = `${JSON.stringify(frontmatter)}\n${body}`;

  for (const { id, pattern } of KNOWN_SECRET_PATTERNS) {
    for (const match of findAll(pattern, text)) {
      findings.push({
        rule: "sec/committed-secret",
        severity: resolveSeverity("sec/committed-secret"),
        artifact: artifactId,
        subject: id,
        message: `possible committed secret matching known pattern "${id}": "${redact(match[0])}"`,
      });
    }
  }

  for (const match of findAll(SUSPICIOUS_KEY_VALUE, text)) {
    const keyName = match[1]!.toLowerCase();
    findings.push({
      rule: "sec/committed-secret",
      severity: resolveSeverity("sec/committed-secret"),
      artifact: artifactId,
      subject: keyName,
      message: `possible committed secret: high-entropy value next to suspicious key "${keyName}"`,
    });
  }

  return findings;
}

function redact(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
