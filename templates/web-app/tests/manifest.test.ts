import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Confirms template.yaml and ibuildos.yaml parse against the shapes
// documented in docs/spec/FORMATS.md §7 (ibuildos.yaml) and §13
// (template.yaml manifest).
//
// These are local mirrors, not imports of the monorepo's zod schemas
// (`packages/schemas/src/config.ts`'s `IBuildOSConfigSchema`, and the
// not-yet-existing `packages/schemas/src/template-manifest.ts`'s
// `TemplateManifestSchema`). Two reasons:
//
//   1. This template must remain installable standalone — `pnpm install`
//      from a bare checkout of `templates/web-app/`, with no dependency on
//      `@ibuildos/schemas` or the rest of the monorepo workspace.
//   2. `TemplateManifestSchema` does not exist yet (verified: no file at
//      `packages/schemas/src/template-manifest.ts`, no export of that name
//      anywhere under `packages/`). When it lands, a monorepo-level test
//      (outside this template, e.g. importing directly from
//      `packages/schemas`) can supersede this one for the real-schema
//      check; until then this is the mechanical, per-template check the
//      task asked for.
//
// Every nested object below is `.strict()` so a typo'd or renamed key
// (e.g. `comands` instead of `commands`) fails the parse instead of being
// silently stripped — zod's default `.parse()` drops unknown keys, which
// would otherwise make this test pass even on a broken manifest.

const ContractCommandsSchema = z
  .object({
    dev: z.array(z.string()).optional(),
    test: z.array(z.string()).optional(),
    lint: z.array(z.string()).optional(),
    seed: z.array(z.string()).optional(),
    migrate: z.array(z.string()).optional(),
    build: z.array(z.string()).optional(),
  })
  .strict();

const PreviewSchema = z
  .object({
    url: z.string(),
    ready: z
      .object({ path: z.string(), status: z.number().int() })
      .strict()
      .optional(),
  })
  .strict();

const OrderedResourceSchema = z
  .object({
    name: z.string(),
    paths: z.array(z.string()),
    command: z.string(),
  })
  .strict();

const ContractComponentSchema = z
  .object({
    paths: z.array(z.string()).optional(),
    commands: ContractCommandsSchema,
    preview: PreviewSchema.optional(),
    ordered: z.array(OrderedResourceSchema).optional(),
    safe: z.array(z.string()).optional(),
  })
  .strict();

const DeployTargetSchema = z
  .object({
    component: z.string().optional(),
    command: z.array(z.string()),
    auth: z
      .object({
        secrets: z.array(z.string()).optional(),
        connect: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const EnvironmentSchema = z
  .object({
    vars: z.record(z.string(), z.string()).default({}),
    secrets: z.array(z.string()).default([]),
  })
  .strict();

// FORMATS.md §13 — template.yaml manifest at template root.
const TemplateManifestSchema = z
  .object({
    formats: z.literal(1),
    name: z.string(),
    version: z.string(),
    engine: z.string(),
    description: z.string(),
    contract: z
      .object({
        components: z.record(z.string(), ContractComponentSchema),
      })
      .strict(),
    profile: z.string(), // "name@version" or a path
    environments: z.record(z.string(), EnvironmentSchema).optional(),
    deploy: z.record(z.string(), DeployTargetSchema).optional(),
    seed_note: z.string().optional(),
  })
  .strict();

// FORMATS.md §7 — ibuildos.yaml at repo root. Mirrors
// packages/schemas/src/config.ts's IBuildOSConfigSchema field-for-field.
const IBuildOSConfigSchema = z
  .object({
    formats: z.literal(1),
    project: z.object({ id: z.string(), name: z.string() }).strict(),
    engine: z.string(),
    profile: z
      .object({ name: z.string(), version: z.string(), path: z.string() })
      .strict(),
    bundle: z.object({ root: z.string() }).strict().optional(),
    template: z
      .object({ name: z.string(), version: z.string() })
      .strict()
      .optional(),
    policies: z
      .object({
        dial: z.enum(["step", "cruise", "auto"]).optional(),
        sync: z
          .object({
            fetch_minutes: z.number().int().positive(),
            push_on_landing: z.boolean(),
          })
          .strict()
          .optional(),
        pr_per_stream: z.boolean().optional(),
        mismatch: z
          .object({
            ui: z.enum(["warn", "refuse"]),
            ci: z.enum(["warn", "refuse"]),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    contract: z
      .object({
        components: z.record(z.string(), ContractComponentSchema),
        deploy: z.record(z.string(), DeployTargetSchema).optional(),
      })
      .strict()
      .optional(),
    environments: z.record(z.string(), EnvironmentSchema).optional(),
    agents: z
      .object({
        default: z.string().optional(),
        roles: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
    mcp: z
      .array(z.object({ name: z.string(), command: z.array(z.string()) }).strict())
      .optional(),
  })
  .strict();

function loadYaml(relPath: string): unknown {
  const abs = resolve(__dirname, "..", relPath);
  return parseYaml(readFileSync(abs, "utf8"));
}

describe("template.yaml", () => {
  it("parses against the FORMATS.md §13 manifest shape", () => {
    const doc = loadYaml("template.yaml");
    const parsed = TemplateManifestSchema.parse(doc);

    expect(parsed.name).toBe("web-app");
    expect(parsed.profile).toBe("ibuildos-default@1.0.0");
    expect(parsed.contract.components.web.commands.dev).toEqual(["pnpm", "dev"]);
    expect(parsed.contract.components.web.commands.test).toEqual(["pnpm", "test"]);
    expect(parsed.contract.components.web.commands.lint).toEqual(["pnpm", "lint"]);
    expect(parsed.contract.components.web.commands.build).toEqual(["pnpm", "build"]);
    expect(parsed.contract.components.web.commands.seed).toEqual(["pnpm", "db:seed"]);
    expect(parsed.contract.components.web.commands.migrate).toEqual([
      "pnpm",
      "db:migrate",
    ]);
    expect(parsed.contract.components.web.preview?.url).toBe(
      "http://localhost:{port}",
    );
    expect(parsed.contract.components.web.ordered?.[0]).toEqual({
      name: "migrations",
      paths: ["drizzle/**"],
      command: "migrate",
    });
  });

  it("rejects a manifest with a misspelled command key", () => {
    const doc = loadYaml("template.yaml") as Record<string, unknown>;
    const contract = doc.contract as {
      components: { web: { commands: Record<string, unknown> } };
    };
    // simulate a typo: "commands" -> the individual key "dev" renamed
    const broken = {
      ...doc,
      contract: {
        components: {
          web: {
            ...contract.components.web,
            commands: {
              ...contract.components.web.commands,
              dov: contract.components.web.commands.dev, // typo'd key
              dev: undefined,
            },
          },
        },
      },
    };

    expect(TemplateManifestSchema.safeParse(broken).success).toBe(false);
  });
});

describe("ibuildos.yaml", () => {
  it("parses against the FORMATS.md §7 / IBuildOSConfigSchema shape", () => {
    const doc = loadYaml("ibuildos.yaml");
    const parsed = IBuildOSConfigSchema.parse(doc);

    expect(parsed.formats).toBe(1);
    expect(parsed.profile).toEqual({
      name: "ibuildos-default",
      version: "1.0.0",
      path: "docs/profile",
    });
    expect(parsed.template).toEqual({ name: "web-app", version: "1.0.0" });
    expect(parsed.contract?.components.web.commands.migrate).toEqual([
      "pnpm",
      "db:migrate",
    ]);
    expect(parsed.contract?.deploy?.production.command).toEqual([
      "vercel",
      "deploy",
      "--prod",
    ]);
  });

  it("rejects a config with an unknown top-level key", () => {
    const doc = loadYaml("ibuildos.yaml") as Record<string, unknown>;
    const broken = { ...doc, unexpected_field: true };

    expect(IBuildOSConfigSchema.safeParse(broken).success).toBe(false);
  });
});
