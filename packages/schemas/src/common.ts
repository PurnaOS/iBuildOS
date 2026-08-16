import { z } from "zod";
import { ArtifactIdSchema, LinkTargetSchema } from "./id.js";

// FORMATS.md §4 — common frontmatter keys carried by every OKF artifact.

export const ProvenanceSchema = z.enum(["human", "agent", "imported", "backfilled"]);

export const GeneratedSchema = z.object({
  by: z.string(), // agent identity string, FORMATS §10: "<agent>/<adapter>@<version>"
  at: z.string().datetime({ offset: true }),
});

export const ExternalRefSchema = z.object({
  system: z.string(),
  ref: z.string(),
  url: z.string().url().optional(),
});

// The `links:` block — one map keyed by relationship name, values always arrays of
// IDs (or `ID#AC-n` criterion references), even for single-valued relationships.
export const LinksSchema = z.record(z.string(), z.array(LinkTargetSchema));

export const ClaimSchema = z.object({
  by: ArtifactIdSchema, // a User (US-…) id
  machine: z.string(),
  at: z.string().datetime({ offset: true }),
});

// Base shape shared by every artifact's frontmatter (FORMATS §4 table). Concrete
// types extend this with their own keys (estimate, priority, code, severity, …) —
// those live in the type-profile dialect (§5), not hardcoded here.
export const CommonFrontmatterSchema = z.object({
  type: z.string(),
  id: ArtifactIdSchema,
  title: z.string(),
  state: z.string(),
  owner: ArtifactIdSchema,
  provenance: ProvenanceSchema,
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO-8601 date"),
  links: LinksSchema.optional(),
  assignee: ArtifactIdSchema.optional(),
  generated: GeneratedSchema.optional(),
  sources: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  external: z.array(ExternalRefSchema).optional(),
});

export type CommonFrontmatter = z.infer<typeof CommonFrontmatterSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Links = z.infer<typeof LinksSchema>;
