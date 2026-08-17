import { z } from "zod";
import { ContractComponentSchema, DeployTargetSchema, EnvironmentSchema } from "./config.js";

// FORMATS.md §13 — the template manifest, `template.yaml` at a template's
// root. Project creation copies the scaffold, writes `ibuildos.yaml` with
// `template:` provenance, and runs the TP-003 zero-fix guarantee check.
// Reuses the config schemas' contract/deploy/environment shapes (§7) rather
// than re-declaring them — a template's contract is the same shape a
// project's `ibuildos.yaml` contract section is, just pre-filled.

export const TemplateManifestSchema = z.object({
  formats: z.literal(1),
  name: z.string(),
  version: z.string(),
  engine: z.string(), // semver range, VG-012 pin
  description: z.string().optional(),
  contract: z.object({
    components: z.record(z.string(), ContractComponentSchema).default({}),
  }),
  profile: z.string(), // "name@version", or a path to a profile directory
  environments: z.record(z.string(), EnvironmentSchema).default({}),
  deploy: z.record(z.string(), DeployTargetSchema).default({}),
  seed_note: z.string().optional(),
});

export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
