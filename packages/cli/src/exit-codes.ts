// FORMATS.md §12 — exact exit codes for the `ibuildos` CLI.
export const EXIT_CLEAN = 0; // clean or warnings-only (or --annotate-only forcing 0 on findings)
export const EXIT_ERRORS = 1; // findings include at least one error-severity finding
export const EXIT_USAGE = 2; // usage error (bad flags, missing args, unknown command)
export const EXIT_PIN_MISMATCH = 3; // engine/profile pin mismatch — a refusal, not a finding
export const EXIT_INTERNAL_FAULT = 4; // anything else unexpected

export type ExitCode =
  | typeof EXIT_CLEAN
  | typeof EXIT_ERRORS
  | typeof EXIT_USAGE
  | typeof EXIT_PIN_MISMATCH
  | typeof EXIT_INTERNAL_FAULT;

/** Thrown by command implementations for a usage problem (bad flags, missing
 * required argument, unknown gate/type/command name). Caught at the CLI
 * entry point and mapped to exit 2 without the generic "internal fault"
 * framing exit 4 gets. */
export class UsageError extends Error {}
