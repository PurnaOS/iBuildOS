import { z } from "zod";

// FORMATS.md §5 — the type-profile dialect. One TypeDefinition document per type
// in docs/profile/; the engine natively knows only this meta-format (KB-003/004).

export const FieldKindSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "id",
  "list<string>",
  "list<id>",
]);

export const FieldDefSchema = z.object({
  kind: FieldKindSchema,
  required: z.boolean().default(false),
  values: z.array(z.string()).optional(), // for kind: enum
  pattern: z.string().optional(), // regex, applies to string/id kinds
});

export const TransitionSchema = z.object({
  from: z.union([z.string(), z.array(z.string()), z.literal("*")]),
  to: z.string(),
  gate: z.string().optional(),
  approval: z.string().optional(),
});

export const StatesSchema = z.object({
  vocabulary: z.array(z.string()).min(1),
  initial: z.string(),
  transitions: z.array(TransitionSchema).default([]),
  derived: z.boolean().default(false),
});

export const LinkDefSchema = z.object({
  target: z.array(z.string()).min(1), // type names; abstract targets allowed (polymorphic)
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().positive().optional(),
  cycles: z.literal("forbid").optional(),
});

export const BodySectionSchema = z.object({
  name: z.string(),
  required: z.boolean().default(false),
  items: z.string().optional(), // e.g. "AC" — items carry inline [AC-n] ids
});

export const BodySchema = z.object({
  sections: z.array(BodySectionSchema).default([]),
});

// One markdown file's frontmatter under docs/profile/<name>.md (body = free-text
// documentation, not parsed).
export const TypeDefinitionSchema = z.object({
  type: z.literal("TypeDefinition"),
  defines: z.string(),
  extends: z.string().optional(),
  abstract: z.boolean().default(false),
  prefix: z.string().regex(/^[A-Z]{2}$/).optional(), // abstract types may omit it
  dir: z.string().optional(),
  fields: z.record(z.string(), FieldDefSchema).default({}),
  states: StatesSchema.optional(), // abstract bases may omit; concrete types require it
  links: z.record(z.string(), LinkDefSchema).default({}),
  body: BodySchema.default({ sections: [] }),
  json_schema: z.unknown().nullable().optional(), // escape hatch (KB-004)
});

export type TypeDefinition = z.infer<typeof TypeDefinitionSchema>;
export type FieldDef = z.infer<typeof FieldDefSchema>;
export type LinkDef = z.infer<typeof LinkDefSchema>;
export type Transition = z.infer<typeof TransitionSchema>;

// docs/profile/profile.md — the profile's own version record (VG-012 pins this).
export const ProfileManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  formats: z.literal(1),
});

export type ProfileManifest = z.infer<typeof ProfileManifestSchema>;

// docs/profile/gates.yaml — named gate compositions (FORMATS §6).
// A gate value is a list of rule IDs, `prefix/*` globs, other gate names
// (composition), each optionally suffixed with `?scope=stream|release|changed|all`.
export const GatesFileSchema = z.object({
  formats: z.literal(1),
  gates: z.record(z.string(), z.array(z.string())),
});

export type GatesFile = z.infer<typeof GatesFileSchema>;
