// Programmatic entry point for @ibuildos/cli — used by tests (call `runCli`
// directly rather than spawning the `ibuildos` bin as a subprocess) and
// available to any future in-process consumer (e.g. packages/action).
export * from "./run.js";
export * from "./exit-codes.js";
