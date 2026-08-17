import {
  isFinalId,
  isProvisionalId,
  resolveSeverity,
  TypeDefinitionSchema,
  type Finding,
} from "@ibuildos/schemas";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileMetaValidationError, ProfileRegistry, type ResolvedType } from "../profile/registry.js";

// FORMATS.md §6 — doc/section-required, doc/criteria-items, doc/body-link
// (body-structure checks driven by `ResolvedType.body.sections`), plus
// id/duplicate, id/provisional-on-trunk (bundle-wide ID checks — a natural
// fit alongside the doc-structure checks since both operate on a flat list
// of parsed artifacts rather than one artifact's own frontmatter), and a
// non-throwing wrapper around ProfileRegistry's meta-validation.

const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*$/gm;

function extractHeadings(body: string): Set<string> {
  const headings = new Set<string>();
  for (const match of body.matchAll(HEADING_PATTERN)) {
    headings.add(match[1]!);
  }
  return headings;
}

/** The line range belonging to one named section: everything after its
 * heading up to (not including) the next heading of any level, or EOF.
 * Returns `null` if the section heading isn't present at all (that's
 * `doc/section-required`'s concern, not this helper's caller's). */
function extractSectionBody(body: string, sectionName: string): string | null {
  const lines = body.split("\n");
  const headingLine = new RegExp(`^#{1,6}\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  const startIndex = lines.findIndex((line) => headingLine.test(line));
  if (startIndex === -1) return null;

  const rest = lines.slice(startIndex + 1);
  const nextHeadingOffset = rest.findIndex((line) => /^#{1,6}\s+/.test(line));
  const end = nextHeadingOffset === -1 ? rest.length : nextHeadingOffset;
  return rest.slice(0, end).join("\n");
}

/** `doc/section-required` — every body section the type declares
 * `required: true` must appear as a heading (any `#` level) whose text
 * matches the declared name exactly. */
export function checkSectionRequired(
  artifactId: string,
  body: string,
  type: ResolvedType,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  const headings = extractHeadings(body);

  for (const section of type.body.sections) {
    if (section.required && !headings.has(section.name)) {
      findings.push({
        rule: "doc/section-required",
        severity: resolveSeverity("doc/section-required", context),
        artifact: artifactId,
        subject: section.name,
        message: `required body section "${section.name}" is missing (FORMATS.md §4)`,
      });
    }
  }
  return findings;
}

/** `doc/criteria-items` — every list item in a section declaring `items`
 * (e.g. `items: AC`) must carry a unique inline `[<items>-n]` id. Sections
 * whose heading is missing entirely are skipped — that's
 * `doc/section-required`'s concern. */
export function checkCriteriaItems(
  artifactId: string,
  body: string,
  type: ResolvedType,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];

  for (const section of type.body.sections) {
    if (!section.items) continue;
    const content = extractSectionBody(body, section.name);
    if (content === null) continue;

    const itemPattern = new RegExp(`^-\\s+\\[(${section.items}-\\d+)\\]`);
    const seen = new Map<string, number>();

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;

      const match = itemPattern.exec(line);
      if (!match) {
        findings.push({
          rule: "doc/criteria-items",
          severity: resolveSeverity("doc/criteria-items", context),
          artifact: artifactId,
          subject: section.name,
          message: `list item is missing a [${section.items}-n] id: "${line}"`,
        });
        continue;
      }
      const criterionId = match[1]!;
      seen.set(criterionId, (seen.get(criterionId) ?? 0) + 1);
    }

    for (const [criterionId, count] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
      if (count > 1) {
        findings.push({
          rule: "doc/criteria-items",
          severity: resolveSeverity("doc/criteria-items", context),
          artifact: artifactId,
          subject: criterionId,
          message: `duplicate criterion id "${criterionId}" (${count} occurrences)`,
        });
      }
    }
  }
  return findings;
}

/** `doc/body-link` (warn) — ordinary markdown links in the body should
 * resolve in-repo. Filesystem access is injected via `linkExists` rather
 * than owned by this pure function (mirrors `chain/task-no-code`'s injected
 * file predicate) — callers wire it to the real bundle root; tests wire it
 * to a fake. External links (`http(s):`, `mailto:`) and same-document
 * anchors (`#...`) are never checked. */
export function checkBodyLink(
  artifactId: string,
  body: string,
  linkExists: (href: string) => boolean,
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of body.matchAll(linkPattern)) {
    const href = match[1]!.trim();
    if (href === "" || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    if (!linkExists(href)) {
      findings.push({
        rule: "doc/body-link",
        severity: resolveSeverity("doc/body-link", context),
        artifact: artifactId,
        subject: href,
        message: `body link "${href}" does not resolve in-repo`,
      });
    }
  }
  return findings;
}

/**
 * `id/duplicate` — a final ID must appear at most once across the bundle.
 * Provisional IDs (KB-010) are per-stream and can legitimately collide
 * across different streams' branches (each stream has its own nonce
 * namespace), so this only checks final IDs; a caller evaluating within a
 * single stream who wants provisional-collision detection too would need
 * stream-scoping this flat-list signature doesn't carry (out of scope —
 * see the task's simplifying-assumption note). One finding per duplicated
 * ID (not per occurrence).
 *
 * IMPORTANT for callers: pass the raw parsed-artifact list, never
 * `ArtifactGraph#allArtifacts()` — `ArtifactGraph`'s constructor is
 * last-write-wins on a duplicate ID (the second artifact silently replaces
 * the first in its node map), so a duplicate that went through the graph
 * first is no longer observable here.
 */
export function checkIdDuplicate(
  artifacts: readonly { id: string }[],
  context?: string,
): Finding[] {
  const counts = new Map<string, number>();
  for (const { id } of artifacts) {
    const upper = id.toUpperCase();
    if (!isFinalId(upper)) continue;
    counts.set(upper, (counts.get(upper) ?? 0) + 1);
  }

  const findings: Finding[] = [];
  for (const [id, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > 1) {
      findings.push({
        rule: "id/duplicate",
        severity: resolveSeverity("id/duplicate", context),
        artifact: id,
        subject: "id",
        message: `duplicate final ID "${id}" appears ${count} times in the bundle (FORMATS.md §2)`,
      });
    }
  }
  return findings;
}

/**
 * `id/provisional-on-trunk` — a provisional ID (`<PREFIX>-p<nonce>-<n>`)
 * must never land on trunk unfinalized. A flat list of artifacts carries no
 * stream/branch metadata, so this can't distinguish "still on the
 * originating stream's own branch, where provisional IDs are valid link
 * targets" (KB-010 rule 1) from "landed on trunk, where they must already
 * be finalized" — it treats every artifact handed to it as being evaluated
 * in trunk scope and flags any provisional ID present. A caller validating
 * a stream's own branch (where provisional IDs are expected) should either
 * filter them out first or simply not invoke this check in that context.
 */
export function checkIdProvisionalOnTrunk(
  artifacts: readonly { id: string }[],
  context?: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const { id } of artifacts) {
    if (isProvisionalId(id)) {
      findings.push({
        rule: "id/provisional-on-trunk",
        severity: resolveSeverity("id/provisional-on-trunk", context),
        artifact: id,
        subject: "id",
        message: `provisional ID "${id}" must be finalized by the merge queue before landing on trunk (FORMATS.md §2 KB-010)`,
      });
    }
  }
  return findings;
}

// --- profile/meta-valid: non-throwing variant -------------------------------
//
// ProfileRegistry.resolve()/addDefinition() *throw* ProfileMetaValidationError
// on an unknown extends/link-target/duplicate-definition — useful for a
// caller that wants to fail fast, but FORMATS §6 lists `profile/meta-valid`
// as a data-producing rule, not an exception. `resolveProfileSafely` builds
// a registry from the same raw TypeDefinition documents `fromRawDocuments`
// takes, but catches `ProfileMetaValidationError` at both the
// addDefinition and resolve stages and converts each into a Finding instead
// of letting it propagate — the existing throwing behavior on
// `ProfileRegistry` itself is untouched (other code may still depend on it).
//
// A malformed TypeDefinition document (one that fails `TypeDefinitionSchema`
// itself — e.g. a missing `defines`) is a different failure mode than
// meta-validation and is *not* caught here; it propagates as a ZodError.
// That's a deliberate, narrow scope: `profile/meta-valid` per FORMATS §5 is
// specifically "unknown extends, unknown link target, unreachable state, or
// transition referencing an undefined gate" — not "the YAML doesn't parse as
// a TypeDefinition at all."

function metaFindingSubject(message: string): string {
  if (message.includes("duplicate TypeDefinition")) return "defines";
  if (message.includes("extends unknown type")) return "extends";
  if (/\blink\s+"/.test(message)) return "links";
  return "type";
}

function metaFinding(typeName: string, err: ProfileMetaValidationError, context?: string): Finding {
  return {
    rule: "profile/meta-valid",
    severity: resolveSeverity("profile/meta-valid", context),
    artifact: typeName,
    subject: metaFindingSubject(err.message),
    message: err.message,
  };
}

export interface SafeProfileResolution {
  registry: ProfileRegistry;
  findings: Finding[];
}

/** Non-throwing counterpart to `ProfileRegistry.fromRawDocuments()` +
 * `resolveAll()`: builds the registry from the same raw OKF documents, but
 * every `ProfileMetaValidationError` becomes a `profile/meta-valid` Finding
 * instead of an exception. The returned registry still omits any type that
 * failed to resolve (callers should treat `findings` as the authoritative
 * signal, not assume every `defines:` name is resolvable). */
export function resolveProfileSafely(
  rawDocs: readonly string[],
  context?: string,
): SafeProfileResolution {
  const registry = new ProfileRegistry();
  const findings: Finding[] = [];
  const names: string[] = [];

  for (const raw of rawDocs) {
    const doc = parseOkfDocument(raw);
    const def = TypeDefinitionSchema.parse(doc.frontmatter); // not this rule's concern if it throws — see module comment
    try {
      registry.addDefinition(def);
      names.push(def.defines);
    } catch (err) {
      if (!(err instanceof ProfileMetaValidationError)) throw err;
      findings.push(metaFinding(def.defines, err, context));
    }
  }

  for (const name of names) {
    try {
      registry.resolve(name);
    } catch (err) {
      if (!(err instanceof ProfileMetaValidationError)) throw err;
      findings.push(metaFinding(name, err, context));
    }
  }

  return { registry, findings };
}
