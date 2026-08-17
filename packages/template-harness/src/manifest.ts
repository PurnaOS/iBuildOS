import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  IBuildOSConfigSchema,
  TemplateManifestSchema,
  type IBuildOSConfig,
  type TemplateManifest,
} from "@ibuildos/schemas";
import type { StepResult } from "./types.js";

// TP-003 step 1: `template.yaml` must conform to TemplateManifestSchema and the
// generated `ibuildos.yaml` must conform to IBuildOSConfigSchema. Both checks are
// independent of each other and of everything downstream — a broken ibuildos.yaml
// doesn't block validating template.yaml, and vice versa, so each gets its own
// StepResult. Only a valid template.yaml lets the rest of the pipeline run,
// because it's the source of the contract commands the harness executes (step 3).

function summarizeZodError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

async function readYamlFile(path: string): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `could not read ${path}: ${message}` };
  }
  try {
    return { ok: true, value: parseYaml(raw) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `${path} is not valid YAML: ${message}` };
  }
}

export interface ManifestValidationResult {
  step: StepResult;
  templateManifest?: TemplateManifest;
}

export async function validateTemplateManifest(
  templateDir: string,
  fileName = "template.yaml",
): Promise<ManifestValidationResult> {
  const start = performance.now();
  const path = join(templateDir, fileName);
  const name = `manifest:${fileName}`;

  const loaded = await readYamlFile(path);
  if (!loaded.ok) {
    return { step: { name, status: "fail", durationMs: performance.now() - start, detail: loaded.detail } };
  }

  const parsed = TemplateManifestSchema.safeParse(loaded.value);
  if (!parsed.success) {
    return {
      step: {
        name,
        status: "fail",
        durationMs: performance.now() - start,
        detail: `${fileName} does not conform to TemplateManifestSchema: ${summarizeZodError(parsed.error)}`,
      },
    };
  }

  return {
    step: {
      name,
      status: "pass",
      durationMs: performance.now() - start,
      detail: `${fileName} conforms to TemplateManifestSchema (name "${parsed.data.name}", version ${parsed.data.version})`,
    },
    templateManifest: parsed.data,
  };
}

export interface ConfigValidationResult {
  step: StepResult;
  ibuildosConfig?: IBuildOSConfig;
}

export async function validateIBuildOSConfig(
  templateDir: string,
  fileName = "ibuildos.yaml",
): Promise<ConfigValidationResult> {
  const start = performance.now();
  const path = join(templateDir, fileName);
  const name = `manifest:${fileName}`;

  const loaded = await readYamlFile(path);
  if (!loaded.ok) {
    return { step: { name, status: "fail", durationMs: performance.now() - start, detail: loaded.detail } };
  }

  const parsed = IBuildOSConfigSchema.safeParse(loaded.value);
  if (!parsed.success) {
    return {
      step: {
        name,
        status: "fail",
        durationMs: performance.now() - start,
        detail: `${fileName} does not conform to IBuildOSConfigSchema: ${summarizeZodError(parsed.error)}`,
      },
    };
  }

  return {
    step: {
      name,
      status: "pass",
      durationMs: performance.now() - start,
      detail: `${fileName} conforms to IBuildOSConfigSchema (project "${parsed.data.project.name}")`,
    },
    ibuildosConfig: parsed.data,
  };
}
