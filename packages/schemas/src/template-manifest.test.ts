import { describe, expect, it } from "vitest";
import { TemplateManifestSchema } from "./template-manifest.js";

describe("TemplateManifestSchema", () => {
  it("parses a minimal web-app template manifest", () => {
    const manifest = {
      formats: 1,
      name: "web-app",
      version: "1.0.0",
      engine: ">=1.0.0 <2.0.0",
      description: "Next.js + TypeScript + Tailwind + SQLite",
      contract: {
        components: {
          web: {
            commands: {
              dev: ["pnpm", "dev"],
              test: ["pnpm", "test"],
              build: ["pnpm", "build"],
            },
          },
        },
      },
      profile: "ibuildos-default@1.0.0",
      environments: {
        local: { vars: { DATABASE_URL: "file:./dev.db" }, secrets: [] },
      },
      deploy: {
        staging: {
          component: "web",
          command: ["vercel", "deploy", "--prebuilt"],
        },
      },
    };
    const parsed = TemplateManifestSchema.parse(manifest);
    expect(parsed.name).toBe("web-app");
    expect(parsed.contract.components.web?.commands.dev).toEqual(["pnpm", "dev"]);
  });

  it("defaults contract.components/environments/deploy to empty objects", () => {
    const parsed = TemplateManifestSchema.parse({
      formats: 1,
      name: "bare",
      version: "1.0.0",
      engine: ">=1.0.0",
      contract: {},
      profile: "ibuildos-default@1.0.0",
    });
    expect(parsed.contract.components).toEqual({});
    expect(parsed.environments).toEqual({});
    expect(parsed.deploy).toEqual({});
  });

  it("rejects a wrong formats version", () => {
    expect(() =>
      TemplateManifestSchema.parse({
        formats: 2,
        name: "x",
        version: "1.0.0",
        engine: ">=1.0.0",
        contract: {},
        profile: "p@1.0.0",
      }),
    ).toThrow();
  });
});
