import { access } from "node:fs/promises";
import { join } from "node:path";
import type { TemplateManifest } from "@ibuildos/schemas";
import { validateIBuildOSConfig, validateTemplateManifest } from "./manifest.js";
import { pollPreview, resolvePreviewUrl } from "./preview.js";
import { runToCompletion, spawnDevProcess, stopDevProcess } from "./process-runner.js";
import type { StepResult, TemplateGuaranteeOptions, TemplateGuaranteeReport } from "./types.js";

// Derived structurally from TemplateManifest rather than importing
// ContractComponentSchema + zod directly — keeps this package's dependency
// footprint to just @ibuildos/schemas and yaml (see package.json).
type ContractComponent = TemplateManifest["contract"]["components"][string];

// TP-003's "zero-fix guarantee": scaffold → gates green → tests pass → dev
// server + preview serves. This module mechanically proves that for one
// template directory. See docs/spec/SPEC.md TP-003 and
// docs/spec/TECH-STACK.md T-012's closing note (template CI catches drift).
//
// Execution order for the "at minimum: build, lint, test" contract commands
// (plus seed/migrate if declared) is a judgment call the task leaves open —
// SPEC/FORMATS don't prescribe one. This harness runs: lint (fastest static
// feedback, so a trivial mistake fails in milliseconds, not minutes) → build
// (produce compiled output) → migrate (schema setup, if declared) → seed
// (data population, depends on a migrated schema) → test (exercises built
// code against seeded data). A later command's failure never skips an
// earlier one, and a step's own failure never skips the ones after it — the
// point of this harness is a complete per-step report for CI annotation
// (task requirement 5), not a fail-fast pipeline.
const COMMAND_ORDER = ["lint", "build", "migrate", "seed", "test"] as const;

const DEFAULTS = {
  templateManifestFile: "template.yaml",
  ibuildosConfigFile: "ibuildos.yaml",
  installTimeoutMs: 120_000,
  commandTimeoutMs: 60_000,
  devStartGraceMs: 500,
  previewTimeoutMs: 15_000,
  previewPollIntervalMs: 250,
  stopGraceMs: 3_000,
} satisfies Partial<Record<keyof TemplateGuaranteeOptions, unknown>>;

function skipped(name: string, detail: string): StepResult {
  return { name, status: "skipped", durationMs: 0, detail };
}

function selectComponent(
  manifest: TemplateManifest,
  requested: string | undefined,
): { name?: string; component?: ContractComponent; step: StepResult } {
  const start = performance.now();
  const name = "contract:component-select";
  const names = Object.keys(manifest.contract.components).sort();

  if (names.length === 0) {
    return {
      step: {
        name,
        status: "fail",
        durationMs: performance.now() - start,
        detail: "template.yaml declares no contract components; nothing to run",
      },
    };
  }

  if (requested !== undefined) {
    const component = manifest.contract.components[requested];
    if (!component) {
      return {
        step: {
          name,
          status: "fail",
          durationMs: performance.now() - start,
          detail: `requested component "${requested}" is not declared; available: ${names.join(", ")}`,
        },
      };
    }
    return {
      name: requested,
      component,
      step: {
        name,
        status: "pass",
        durationMs: performance.now() - start,
        detail: `using requested component "${requested}"`,
      },
    };
  }

  const chosen = names[0]!;
  const component = manifest.contract.components[chosen]!; // chosen came from Object.keys(...) above
  const detail =
    names.length === 1
      ? `using the template's only component "${chosen}"`
      : `template declares ${names.length} components (${names.join(", ")}); none requested, defaulting to "${chosen}" alphabetically — pass options.component explicitly for multi-component templates`;
  return {
    name: chosen,
    component,
    step: { name, status: "pass", durationMs: performance.now() - start, detail },
  };
}

async function runInstall(
  templateDir: string,
  options: { timeoutMs: number; env?: Record<string, string> | undefined },
): Promise<StepResult> {
  const name = "install";
  const packageJsonPath = join(templateDir, "package.json");

  try {
    await access(packageJsonPath);
  } catch {
    return skipped(name, `no package.json at ${packageJsonPath}; nothing to install for this stack`);
  }

  const start = performance.now();
  // `--ignore-workspace`: a scaffolded project is standalone (its own repo, no
  // ancestor pnpm-workspace.yaml) — but our own synthetic fixtures (and, for
  // now, the real templates under templates/) live nested inside *this*
  // monorepo's workspace. Without this flag, `pnpm install` run from a nested
  // directory silently resolves to the iBuildOS workspace root and reinstalls
  // all 10 packages instead of the template alone (confirmed empirically —
  // it even rewrites the root pnpm-lock.yaml). The flag makes pnpm treat
  // templateDir as its own standalone project either way, matching what a
  // real scaffolded project's install actually looks like.
  const command = ["pnpm", "install", "--ignore-workspace"];
  const result = await runToCompletion(command, { cwd: templateDir, timeoutMs: options.timeoutMs, env: options.env });
  const durationMs = performance.now() - start;

  if (result.timedOut) {
    return {
      name,
      status: "fail",
      durationMs,
      command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      detail: `pnpm install timed out after ${options.timeoutMs}ms`,
    };
  }

  return {
    name,
    status: result.exitCode === 0 ? "pass" : "fail",
    durationMs,
    command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    detail: result.exitCode === 0 ? "pnpm install exited 0" : `pnpm install exited ${result.exitCode}`,
  };
}

async function runContractCommand(
  key: string,
  argv: string[],
  templateDir: string,
  options: { timeoutMs: number; env?: Record<string, string> | undefined },
): Promise<StepResult> {
  const name = `command:${key}`;
  const start = performance.now();
  const result = await runToCompletion(argv, { cwd: templateDir, timeoutMs: options.timeoutMs, env: options.env });
  const durationMs = performance.now() - start;

  if (result.timedOut) {
    return {
      name,
      status: "fail",
      durationMs,
      command: argv,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      detail: `"${key}" (${argv.join(" ")}) timed out after ${options.timeoutMs}ms`,
    };
  }

  return {
    name,
    status: result.exitCode === 0 ? "pass" : "fail",
    durationMs,
    command: argv,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    detail:
      result.exitCode === 0
        ? `"${key}" (${argv.join(" ")}) exited 0`
        : `"${key}" (${argv.join(" ")}) exited ${result.exitCode}`,
  };
}

async function runDevAndPreview(
  component: ContractComponent,
  templateDir: string,
  options: Required<
    Pick<
      TemplateGuaranteeOptions,
      "devStartGraceMs" | "previewTimeoutMs" | "previewPollIntervalMs" | "stopGraceMs"
    >
  > & { port?: number | undefined; env?: Record<string, string> | undefined },
): Promise<StepResult[]> {
  const devCommand = component.commands.dev;
  if (!devCommand || devCommand.length === 0) {
    const detail = "no \"dev\" command declared by this component";
    return [skipped("dev:start", detail), skipped("preview:poll", detail), skipped("dev:stop", detail)];
  }

  const startTime = performance.now();
  const handle = spawnDevProcess(devCommand, { cwd: templateDir, env: options.env });

  const raceResult = await Promise.race([
    handle.exited.then((info) => ({ exited: true as const, info })),
    new Promise<{ exited: false }>((resolve) => setTimeout(() => resolve({ exited: false }), options.devStartGraceMs)),
  ]);

  if (raceResult.exited) {
    const devStart: StepResult = {
      name: "dev:start",
      status: "fail",
      durationMs: performance.now() - startTime,
      command: devCommand,
      exitCode: raceResult.info.code,
      stdout: handle.stdoutTail(),
      stderr: handle.stderrTail(),
      detail: `dev process exited (code ${raceResult.info.code}, signal ${raceResult.info.signal}) within the ${options.devStartGraceMs}ms start grace period`,
    };
    const reason = "dev process exited before it could be polled";
    return [devStart, skipped("preview:poll", reason), skipped("dev:stop", "nothing to stop; process already exited")];
  }

  const devStart: StepResult = {
    name: "dev:start",
    status: "pass",
    durationMs: performance.now() - startTime,
    command: devCommand,
    detail: `dev process still running after the ${options.devStartGraceMs}ms start grace period`,
  };

  const steps: StepResult[] = [devStart];

  const preview = component.preview;
  const ready = preview?.ready;
  if (!ready) {
    steps.push(
      skipped(
        "preview:poll",
        preview
          ? "component's preview.ready is not declared; cannot assert an expected status"
          : "component declares no preview; nothing to poll",
      ),
    );
  } else {
    try {
      // `preview` is guaranteed defined here — `ready` came from `preview?.ready`.
      const url = resolvePreviewUrl(preview!.url, options.port);
      steps.push(
        await pollPreview(url, ready, {
          timeoutMs: options.previewTimeoutMs,
          intervalMs: options.previewPollIntervalMs,
          devExited: handle.exited,
        }),
      );
    } catch (error) {
      steps.push({
        name: "preview:poll",
        status: "fail",
        durationMs: 0,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const stopStart = performance.now();
  try {
    const stopResult = await stopDevProcess(handle, options.stopGraceMs);
    steps.push({
      name: "dev:stop",
      status: "pass",
      durationMs: performance.now() - stopStart,
      detail: !stopResult.stopped
        ? "dev process had already exited on its own; nothing to clean up"
        : stopResult.forced
          ? `stopped the dev process tree (escalated to SIGKILL after ${options.stopGraceMs}ms)`
          : "stopped the dev process tree cleanly (SIGTERM)",
    });
  } catch (error) {
    steps.push({
      name: "dev:stop",
      status: "fail",
      durationMs: performance.now() - stopStart,
      detail: `failed to stop dev process tree: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return steps;
}

/**
 * Mechanically proves (or disproves) TP-003 for one template directory:
 * validates template.yaml/ibuildos.yaml, runs `pnpm install` if applicable,
 * runs each declared contract command, then starts `dev` and polls
 * `preview` before cleanly stopping it. Every step — pass, fail, or skipped
 * — lands in the returned report so a CI job can annotate exactly what
 * broke.
 */
export async function runTemplateGuarantee(
  templateDir: string,
  options: TemplateGuaranteeOptions = {},
): Promise<TemplateGuaranteeReport> {
  const steps: StepResult[] = [];
  const env = options.env;

  const templateManifestResult = await validateTemplateManifest(
    templateDir,
    options.templateManifestFile ?? DEFAULTS.templateManifestFile,
  );
  steps.push(templateManifestResult.step);

  const ibuildosConfigResult = await validateIBuildOSConfig(
    templateDir,
    options.ibuildosConfigFile ?? DEFAULTS.ibuildosConfigFile,
  );
  steps.push(ibuildosConfigResult.step);

  const manifest = templateManifestResult.templateManifest;
  if (!manifest) {
    const reason = "template.yaml failed manifest validation; cannot determine the contract to run";
    steps.push(skipped("contract:component-select", reason));
    steps.push(skipped("install", reason));
    for (const key of COMMAND_ORDER) steps.push(skipped(`command:${key}`, reason));
    steps.push(skipped("dev:start", reason), skipped("preview:poll", reason), skipped("dev:stop", reason));
    return { templateDir, ok: false, steps };
  }

  const selection = selectComponent(manifest, options.component);
  steps.push(selection.step);

  if (!selection.component) {
    const reason = "no usable contract component; cannot run install/commands/preview";
    steps.push(skipped("install", reason));
    for (const key of COMMAND_ORDER) steps.push(skipped(`command:${key}`, reason));
    steps.push(skipped("dev:start", reason), skipped("preview:poll", reason), skipped("dev:stop", reason));
    return { templateDir, component: selection.name, ok: false, steps };
  }

  const component = selection.component;

  steps.push(await runInstall(templateDir, { timeoutMs: options.installTimeoutMs ?? DEFAULTS.installTimeoutMs, env }));

  for (const key of COMMAND_ORDER) {
    const argv = component.commands[key];
    if (!argv || argv.length === 0) {
      steps.push(skipped(`command:${key}`, `component "${selection.name}" does not declare a "${key}" command`));
      continue;
    }
    steps.push(
      await runContractCommand(key, argv, templateDir, {
        timeoutMs: options.commandTimeoutMs ?? DEFAULTS.commandTimeoutMs,
        env,
      }),
    );
  }

  steps.push(
    ...(await runDevAndPreview(component, templateDir, {
      devStartGraceMs: options.devStartGraceMs ?? DEFAULTS.devStartGraceMs,
      previewTimeoutMs: options.previewTimeoutMs ?? DEFAULTS.previewTimeoutMs,
      previewPollIntervalMs: options.previewPollIntervalMs ?? DEFAULTS.previewPollIntervalMs,
      stopGraceMs: options.stopGraceMs ?? DEFAULTS.stopGraceMs,
      port: options.port,
      env,
    })),
  );

  return {
    templateDir,
    component: selection.name,
    ok: steps.every((step) => step.status !== "fail"),
    steps,
  };
}
