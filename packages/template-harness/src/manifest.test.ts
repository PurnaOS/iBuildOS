import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateIBuildOSConfig, validateTemplateManifest } from "./manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "fixtures");

describe("validateTemplateManifest", () => {
  it("green path: good-template's template.yaml conforms to TemplateManifestSchema", async () => {
    const result = await validateTemplateManifest(join(fixturesRoot, "good-template"));
    expect(result.step.status).toBe("pass");
    expect(result.templateManifest?.name).toBe("synthetic-fixture-good");
    expect(result.templateManifest?.contract.components.app?.commands.build).toEqual([
      "pnpm",
      "run",
      "build",
    ]);
  });

  it("red path: bad-manifest-template's template.yaml is missing the required engine field", async () => {
    const result = await validateTemplateManifest(join(fixturesRoot, "bad-manifest-template"));
    expect(result.step.status).toBe("fail");
    expect(result.step.detail).toContain("engine");
    expect(result.templateManifest).toBeUndefined();
  });

  it("red path: a directory with no template.yaml at all", async () => {
    const result = await validateTemplateManifest(fixturesRoot);
    expect(result.step.status).toBe("fail");
    expect(result.step.detail).toContain("could not read");
  });
});

describe("validateIBuildOSConfig", () => {
  it("green path: good-template's ibuildos.yaml conforms to IBuildOSConfigSchema", async () => {
    const result = await validateIBuildOSConfig(join(fixturesRoot, "good-template"));
    expect(result.step.status).toBe("pass");
    expect(result.ibuildosConfig?.project.name).toBe("Synthetic Fixture (good)");
  });

  it("green path: bad-manifest-template's ibuildos.yaml is independently valid", async () => {
    const result = await validateIBuildOSConfig(join(fixturesRoot, "bad-manifest-template"));
    expect(result.step.status).toBe("pass");
  });
});
