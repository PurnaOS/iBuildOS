// Shared report shapes for the TP-003 "zero-fix guarantee" harness. A
// `TemplateGuaranteeReport` is per-template; it holds one `StepResult` per
// mechanical check (manifest validation, install, each contract command, the
// dev/preview cycle) so a future CI job can annotate exactly which step
// broke rather than just "the template failed."

export type StepStatus = "pass" | "fail" | "skipped";

export interface StepResult {
  /** Stable machine-readable name, e.g. "manifest:template.yaml", "command:build", "preview:poll". */
  name: string;
  status: StepStatus;
  durationMs: number;
  /** Human-readable summary — always present, explains a pass, a fail, or why a step was skipped. */
  detail: string;
  /** The argv that was spawned, if this step ran a subprocess. */
  command?: string[];
  exitCode?: number | null;
  /** Tail of captured stdout (truncated — see process-runner.ts OUTPUT_TAIL_CHARS). */
  stdout?: string;
  /** Tail of captured stderr. */
  stderr?: string;
}

export interface TemplateGuaranteeReport {
  templateDir: string;
  /** The contract component the harness ran commands against. Undefined if selection never happened. */
  component?: string | undefined;
  /** True iff every non-skipped step passed. */
  ok: boolean;
  steps: StepResult[];
}

export interface TemplateGuaranteeOptions {
  /** Explicit contract component to exercise. Defaults to the template's only component, or the
   * first alphabetically when it declares more than one (TP-009 multi-component repos are out of
   * scope for this harness — see guarantee.ts). */
  component?: string;
  /** template.yaml filename, relative to templateDir. Defaults to "template.yaml". */
  templateManifestFile?: string;
  /** generated ibuildos.yaml filename, relative to templateDir. Defaults to "ibuildos.yaml". */
  ibuildosConfigFile?: string;
  /** Order in which declared contract commands run. Defaults to COMMAND_ORDER (see guarantee.ts). */
  commandOrder?: string[];
  /** Timeout for `pnpm install`, ms. Default 120_000. */
  installTimeoutMs?: number;
  /** Timeout per contract command, ms. Default 60_000. */
  commandTimeoutMs?: number;
  /** How long to wait for the dev process to fail fast before treating it as "started", ms. Default 500. */
  devStartGraceMs?: number;
  /** How long to poll the preview URL before giving up, ms. Default 15_000. */
  previewTimeoutMs?: number;
  /** Delay between preview poll attempts, ms. Default 250. */
  previewPollIntervalMs?: number;
  /** Grace period for SIGTERM before escalating to SIGKILL when stopping the dev process, ms. Default 3_000. */
  stopGraceMs?: number;
  /** Substituted for a literal "{port}" token in `preview.url`/`preview.ready`, if present. */
  port?: number;
  /** Extra environment variables merged over process.env for every spawned command. */
  env?: Record<string, string>;
}
