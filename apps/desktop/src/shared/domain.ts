import { z } from "zod";

// Desktop-app-local domain types (not part of @ibuildos/schemas — that package
// covers OKF artifact frontmatter/type-profile/config shapes per FORMATS.md;
// "Project" as a home-screen list entry is a shell concept, SPEC.md §A "PS").
//
// This scaffold backs everything with an in-memory fake (see src/main/backend/)
// — no real git/filesystem/engine calls (packages/engine has no build step yet
// and is out of scope here per the work package brief).

export const TEMPLATE_IDS = ["web-app", "api-service", "static-site"] as const;
export const TemplateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const TemplateSchema = z.object({
  id: TemplateIdSchema,
  name: z.string(),
  summary: z.string(),
  stack: z.array(z.string()),
});
export type Template = z.infer<typeof TemplateSchema>;

// T-012's initial template set — shown in the PS-004 "create project" wizard's
// template-choice step.
export const TEMPLATES: readonly Template[] = [
  {
    id: "web-app",
    name: "Web app",
    summary: "A full product with pages, a database, and a live preview.",
    stack: ["Next.js", "TypeScript", "Tailwind", "SQLite"],
  },
  {
    id: "api-service",
    name: "API service",
    summary: "A backend service with no user interface of its own.",
    stack: ["Hono", "Node", "SQLite"],
  },
  {
    id: "static-site",
    name: "Static site",
    summary: "A fast, content-first site with no backend to run.",
    stack: ["Astro", "Tailwind"],
  },
] as const;

// PS-002's "live state" summary shown on the Home project grid, in
// Product-mode vocabulary (DESIGN-CHARTER §4 — no "gate", no "branch").
export const CHECKS_STATUS = ["ready", "needs-attention", "in-progress"] as const;
export const ChecksStatusSchema = z.enum(CHECKS_STATUS);
export type ChecksStatus = z.infer<typeof ChecksStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: TemplateIdSchema,
  createdAt: z.string().datetime({ offset: true }),
  activeBuilds: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  checksStatus: ChecksStatusSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1, "Name your project.").max(120),
  template: TemplateIdSchema,
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

// The live-activity / attention-queue stream (PS-008/PS-009). One event shape
// feeds both surfaces: the attention queue is the subsequence with
// needsAttention: true.
export const ACTIVITY_KINDS = ["note", "question", "approval", "check"] as const;
export const ActivityKindSchema = z.enum(ACTIVITY_KINDS);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  kind: ActivityKindSchema,
  message: z.string(),
  occurredAt: z.string().datetime({ offset: true }),
  needsAttention: z.boolean(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
