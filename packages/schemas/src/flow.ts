import { z } from "zod";
import { ArtifactIdSchema } from "./id.js";
import { CommonFrontmatterSchema } from "./common.js";

// FORMATS.md §9 — flow-record frontmatter, beyond the §4 common keys.

export const RunFrontmatterSchema = CommonFrontmatterSchema.extend({
  type: z.literal("Run"),
  agent: z.string(), // identity string, §10
  role: z.string().optional(), // AC-008 role
  stream: z.string().optional(), // nonce, or absent
  subject: z.array(z.string()), // ST/TA/CH/BG ids, or "merge"/"adoption"/"interview"
  started: z.string().datetime({ offset: true }),
  ended: z.string().datetime({ offset: true }).optional(),
  outcome: z.enum(["done", "failed", "aborted", "superseded"]).optional(),
  gates: z.record(z.string(), z.enum(["green", "red"])).default({}),
  transcript: z.string().optional(), // ibos-transcript://<project-ulid>/<RN-id>.jsonl
});

export type RunFrontmatter = z.infer<typeof RunFrontmatterSchema>;

export const ReviewFrontmatterSchema = CommonFrontmatterSchema.extend({
  type: z.literal("Review"),
  subject: z.string(),
  verdict: z.enum(["accepted", "changes", "rejected", "waived"]),
  mode: z.enum(["product", "engineering", "dial-waived"]),
  commit: z.string(),
  criteria: z.record(z.string(), z.enum(["pass", "fail", "waived"])).default({}),
});

export type ReviewFrontmatter = z.infer<typeof ReviewFrontmatterSchema>;

export const TestResultFrontmatterSchema = CommonFrontmatterSchema.extend({
  type: z.literal("TestResult"),
  subject: z.string(), // TC or SU id
  commit: z.string(),
  verdict: z.enum(["pass", "fail", "skip"]),
  kind: z.enum(["automated", "manual"]),
  cases: z.record(z.string(), z.enum(["pass", "fail", "skip"])).optional(),
  evidence: z.array(z.string()).optional(),
});

export type TestResultFrontmatter = z.infer<typeof TestResultFrontmatterSchema>;

export const DeployFrontmatterSchema = CommonFrontmatterSchema.extend({
  type: z.literal("Deploy"),
  target: z.string(),
  environment: z.string(),
  commit: z.string(),
  by: ArtifactIdSchema,
  url: z.string().url().optional(),
  outcome: z.string(),
});

export type DeployFrontmatter = z.infer<typeof DeployFrontmatterSchema>;

export const ChangeFrontmatterSchema = CommonFrontmatterSchema.extend({
  type: z.literal("Change"),
});

export type ChangeFrontmatter = z.infer<typeof ChangeFrontmatterSchema>;

// Transcript JSONL — one machine-local event per line (§9), never committed.
export const TranscriptEventSchema = z.object({
  t: z.string().datetime({ offset: true }),
  kind: z.enum([
    "message",
    "thought",
    "tool_call",
    "tool_result",
    "permission",
    "component",
    "answer",
    "system",
  ]),
  role: z.enum(["agent", "user"]),
  data: z.unknown(),
});

export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;
