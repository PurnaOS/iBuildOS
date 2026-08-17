import { z } from "zod";

// FORMATS.md §12 — stable findings JSON schema (the CLI's machine-readable output).

// "warn", not "warning" — matches FORMATS.md §6's own rule-table column
// exactly (FORMATS is byte-authoritative; see CLAUDE.md's precedence rule).
export const SeveritySchema = z.enum(["error", "warn", "info"]);

export const FindingSchema = z.object({
  rule: z.string(),
  severity: SeveritySchema,
  artifact: z.string(),
  subject: z.string(), // field key / link relationship / criterion id / glob string
  message: z.string(),
  fix: z.string().optional(),
  fp: z.string().optional(), // baseline fingerprint (§8), present once computed
});

export type Finding = z.infer<typeof FindingSchema>;

export const FindingsReportSchema = z.object({
  formats: z.literal(1),
  engine: z.string(),
  profile: z.string(),
  commit: z.string(),
  gate: z.string(),
  findings: z.array(FindingSchema),
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
    baselined: z.number().int().nonnegative(),
  }),
});

export type FindingsReport = z.infer<typeof FindingsReportSchema>;

// FORMATS.md §8 — .ibuildos/baseline.json (committed accepted-debt record).
export const BaselineEntrySchema = z.object({
  rule: z.string(),
  artifact: z.string(),
  fp: z.string(), // hex(sha256(rule_id + "\0" + artifact_id + "\0" + subject))[:16]
});

export const BaselineScopeEventSchema = z.object({
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  added_paths: z.array(z.string()),
  entries: z.number().int().nonnegative(),
});

export const BaselineSchema = z.object({
  formats: z.literal(1),
  engine: z.string(),
  profile: z.string(),
  generated: z.string().datetime({ offset: true }),
  scope_events: z.array(BaselineScopeEventSchema).default([]),
  entries: z.array(BaselineEntrySchema).default([]),
});

export type Baseline = z.infer<typeof BaselineSchema>;
export type BaselineEntry = z.infer<typeof BaselineEntrySchema>;
