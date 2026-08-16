import { z } from "zod";

// FORMATS.md §7 — project configuration, `ibuildos.yaml` at repo root (no leading
// dot — that was v0.5's `.ibuildos.yaml`; FORMATS is the bytes authority now).

export const ContractCommandsSchema = z.object({
  dev: z.array(z.string()).optional(),
  test: z.array(z.string()).optional(),
  lint: z.array(z.string()).optional(),
  seed: z.array(z.string()).optional(),
  migrate: z.array(z.string()).optional(),
  build: z.array(z.string()).optional(),
});

export const PreviewSchema = z.object({
  url: z.string(),
  ready: z
    .object({
      path: z.string(),
      status: z.number().int(),
    })
    .optional(),
});

export const OrderedResourceSchema = z.object({
  name: z.string(),
  paths: z.array(z.string()),
  command: z.string(), // key into commands, e.g. "migrate" (IG-011)
});

export const ContractComponentSchema = z.object({
  paths: z.array(z.string()).optional(),
  commands: ContractCommandsSchema,
  preview: PreviewSchema.optional(),
  ordered: z.array(OrderedResourceSchema).optional(),
  safe: z.array(z.string()).optional(), // commands auto-approved for agents (AC-006)
});

export const DeployTargetSchema = z.object({
  component: z.string().optional(),
  command: z.array(z.string()),
  auth: z
    .object({
      secrets: z.array(z.string()).optional(),
      connect: z.string().optional(),
    })
    .optional(),
});

export const EnvironmentSchema = z.object({
  vars: z.record(z.string(), z.string()).default({}),
  secrets: z.array(z.string()).default([]), // names only — never values (PV-005)
});

export const PoliciesSchema = z.object({
  dial: z.enum(["step", "cruise", "auto"]).default("cruise"), // DEFAULTS #1
  sync: z
    .object({
      fetch_minutes: z.number().int().positive().default(5),
      push_on_landing: z.boolean().default(true),
    })
    .default({ fetch_minutes: 5, push_on_landing: true }),
  pr_per_stream: z.boolean().default(false),
  mismatch: z
    .object({
      ui: z.enum(["warn", "refuse"]).default("warn"),
      ci: z.enum(["warn", "refuse"]).default("refuse"),
    })
    .default({ ui: "warn", ci: "refuse" }),
});

export const AgentsConfigSchema = z.object({
  default: z.string().optional(),
  roles: z.record(z.string(), z.string()).default({}),
});

export const McpServerSchema = z.object({
  name: z.string(),
  command: z.array(z.string()),
});

export const IBuildOSConfigSchema = z.object({
  formats: z.literal(1),
  project: z.object({
    id: z.string(), // ULID, generated once (PS-014)
    name: z.string(),
  }),
  engine: z.string(), // semver range, VG-012 pin
  profile: z.object({
    name: z.string(),
    version: z.string(),
    path: z.string().default("docs/profile"),
  }),
  bundle: z
    .object({
      root: z.string().default("docs"),
    })
    .default({ root: "docs" }),
  template: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .optional(),
  policies: PoliciesSchema.default({
    dial: "cruise",
    sync: { fetch_minutes: 5, push_on_landing: true },
    pr_per_stream: false,
    mismatch: { ui: "warn", ci: "refuse" },
  }),
  contract: z
    .object({
      components: z.record(z.string(), ContractComponentSchema).default({}),
      deploy: z.record(z.string(), DeployTargetSchema).default({}),
    })
    .optional(),
  environments: z.record(z.string(), EnvironmentSchema).default({}),
  agents: AgentsConfigSchema.default({ roles: {} }),
  mcp: z.array(McpServerSchema).default([]),
});

export type IBuildOSConfig = z.infer<typeof IBuildOSConfigSchema>;
