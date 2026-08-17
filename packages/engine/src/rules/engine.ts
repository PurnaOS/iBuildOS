import {
  ArtifactIdSchema,
  FINAL_ID_PATTERN,
  resolveSeverity,
  type Finding,
} from "@ibuildos/schemas";
import type { ResolvedType } from "../profile/registry.js";

// FORMATS.md §6 rule registry — this pass implements the three rules needed
// to prove the store→profile→rule pipeline end to end. The remaining rows
// (link/*, state/*, chain/*, merge/*, evid/*, …) and the gate-composition
// engine (gates.yaml) are the rest of M1, continuing after this session.

const COMMON_REQUIRED_KEYS = [
  "type",
  "id",
  "title",
  "state",
  "owner",
  "provenance",
  "created",
] as const;

export function checkIdFormat(artifactId: string): Finding[] {
  if (FINAL_ID_PATTERN.test(artifactId.toUpperCase())) return [];
  return [
    {
      rule: "id/format",
      severity: resolveSeverity("id/format"),
      artifact: artifactId,
      subject: "id",
      message: `"${artifactId}" does not match <PREFIX>-<NNNN> (FORMATS.md §2)`,
    },
  ];
}

export function checkFieldRequired(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
): Finding[] {
  const findings: Finding[] = [];

  for (const key of COMMON_REQUIRED_KEYS) {
    if (frontmatter[key] === undefined) {
      findings.push({
        rule: "doc/field-required",
        severity: resolveSeverity("doc/field-required"),
        artifact: artifactId,
        subject: key,
        message: `required field "${key}" is missing (FORMATS.md §4)`,
      });
    }
  }

  for (const [key, def] of Object.entries(type.fields)) {
    if (def.required && frontmatter[key] === undefined) {
      findings.push({
        rule: "doc/field-required",
        severity: resolveSeverity("doc/field-required"),
        artifact: artifactId,
        subject: key,
        message: `required field "${key}" is missing (declared by type "${type.name}")`,
      });
    }
  }

  return findings;
}

function matchesKind(
  value: unknown,
  def: { kind: string; values?: string[] | undefined },
): boolean {
  switch (def.kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
    case "enum":
      return typeof value === "string" && (def.values ?? []).includes(value);
    case "id":
      return typeof value === "string" && ArtifactIdSchema.safeParse(value).success;
    case "list<string>":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "list<id>":
      return (
        Array.isArray(value) &&
        value.every((v) => typeof v === "string" && ArtifactIdSchema.safeParse(v).success)
      );
    default:
      return true; // unknown kind — not this rule's concern
  }
}

export function checkFieldKind(
  artifactId: string,
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
): Finding[] {
  const findings: Finding[] = [];

  for (const [key, def] of Object.entries(type.fields)) {
    const value = frontmatter[key];
    if (value === undefined) continue; // doc/field-required's concern, not this rule's
    if (!matchesKind(value, def)) {
      findings.push({
        rule: "doc/field-kind",
        severity: resolveSeverity("doc/field-kind"),
        artifact: artifactId,
        subject: key,
        message: `field "${key}" does not match declared kind "${def.kind}"`,
      });
    }
  }

  return findings;
}

export function validateArtifact(
  frontmatter: Record<string, unknown>,
  type: ResolvedType,
): Finding[] {
  const artifactId = typeof frontmatter.id === "string" ? frontmatter.id : "<unknown-id>";
  return [
    ...checkIdFormat(artifactId),
    ...checkFieldRequired(artifactId, frontmatter, type),
    ...checkFieldKind(artifactId, frontmatter, type),
  ];
}
