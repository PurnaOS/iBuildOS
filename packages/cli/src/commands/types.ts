/** Shared shape every command function receives — `cwd` is threaded
 * explicitly (never read from `process.cwd()` inside command logic) so tests
 * can point the CLI's dispatch at a fixture directory without touching the
 * real process's working directory. `print` collects one command's stdout;
 * `src/run.ts` is the only place that decides where it ultimately goes. */
export interface CommandEnv {
  cwd: string;
  print: (line: string) => void;
}
