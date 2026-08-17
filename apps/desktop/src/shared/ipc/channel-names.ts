// Preload↔main plumbing channel names for the request/response and
// subscription lifecycle. Split out from contract.ts (which is where these
// used to live) so the *sandboxed* preload script (src/preload/index.ts) can
// import them without pulling zod into its module graph — a sandboxed
// preload's `require` only allows a small Node/Electron built-in allowlist,
// so `require("zod")` fails at runtime even when the file itself loads fine
// (confirmed empirically building this scaffold). contract.ts re-exports
// these so main-side code (router.ts, ipc.ts) doesn't need to know about the
// split.
export const REQUEST_CHANNEL = "ibuildos:request";
export const SUBSCRIBE_CHANNEL = "ibuildos:subscribe";
export const UNSUBSCRIBE_CHANNEL = "ibuildos:unsubscribe";
export const SUBSCRIPTION_EVENT_PREFIX = "ibuildos:event:";
