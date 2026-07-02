// IBUILD_VERSION is inlined at build time via `bun build --define`. In `bun test`
// and `bun run` it is undefined, so we fall back to "dev".
declare const IBUILD_VERSION: string | undefined;

export const Version: string =
  typeof IBUILD_VERSION !== "undefined" ? IBUILD_VERSION : "dev";
