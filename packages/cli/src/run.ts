import { runValidate } from "./commands/validate.js";
import { runGate } from "./commands/gate.js";
import { runBaseline } from "./commands/baseline.js";
import { runRules } from "./commands/rules.js";
import { runGates } from "./commands/gates.js";
import { runInstructions } from "./commands/instructions.js";
import { runGraph } from "./commands/graph.js";
import { EXIT_INTERNAL_FAULT, EXIT_USAGE, UsageError } from "./exit-codes.js";

export interface RunCliOptions {
  cwd: string;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function isParseArgsError(error: unknown): error is Error {
  return (
    error instanceof TypeError &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code!.startsWith("ERR_PARSE_ARGS")
  );
}

const USAGE = `usage: ibuildos <command> [options]

Commands:
  validate [path] [--changed | --base <ref>] [--baseline] [--format text|json] [--annotate-only]
  gate <name> [--commit <sha>] [--format text|json] [--annotate-only]
  baseline write | show [--format text|json]
  rules [--format text|json]
  gates [--profile <dir>] [--format text|json]
  instructions <Type> [--profile <dir>] [--format text|json]
  graph export [--format json] | matrix [--format json|csv]
`;

/**
 * The CLI's full dispatch, decoupled from real stdio/process.exit so it's
 * directly callable from tests (and from `src/cli.ts`, the actual bin entry)
 * without spawning a subprocess. Returns collected stdout/stderr plus the
 * exact FORMATS §12 exit code rather than writing/exiting itself.
 */
export async function runCli(argv: string[], options: RunCliOptions): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const env = { cwd: options.cwd, print: (line: string) => out.push(line) };

  try {
    const [command, ...rest] = argv;

    if (!command || command === "--help" || command === "-h") {
      out.push(USAGE);
      return { code: 0, stdout: out.join(""), stderr: err.join("") };
    }

    let code: number;
    switch (command) {
      case "validate":
        code = await runValidate(rest, env);
        break;
      case "gate":
        code = await runGate(rest, env);
        break;
      case "baseline":
        code = await runBaseline(rest, env);
        break;
      case "rules":
        code = await runRules(rest, env);
        break;
      case "gates":
        code = await runGates(rest, env);
        break;
      case "instructions":
        code = await runInstructions(rest, env);
        break;
      case "graph":
        code = await runGraph(rest, env);
        break;
      default:
        throw new UsageError(`unknown command "${command}"\n\n${USAGE}`);
    }

    return { code, stdout: out.join(""), stderr: err.join("") };
  } catch (error) {
    if (error instanceof UsageError) {
      err.push(`usage error: ${error.message}\n`);
      return { code: EXIT_USAGE, stdout: out.join(""), stderr: err.join("") };
    }
    // node:util's parseArgs throws a plain TypeError (ERR_PARSE_ARGS_*) on an
    // unknown flag or a missing value for a `type: "string"` option — that's
    // a usage error (exit 2), not an internal fault (exit 4).
    if (isParseArgsError(error)) {
      err.push(`usage error: ${error.message}\n`);
      return { code: EXIT_USAGE, stdout: out.join(""), stderr: err.join("") };
    }
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    err.push(`internal fault: ${message}\n`);
    return { code: EXIT_INTERNAL_FAULT, stdout: out.join(""), stderr: err.join("") };
  }
}
