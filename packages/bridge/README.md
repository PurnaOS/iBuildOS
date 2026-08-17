# @ibuildos/bridge

ACP↔AG-UI bridge and the generative-UI component catalog (T-004).

**Status:** core event-mapping module implemented (this round). Scoped to
**M5 (Conversation & breakdown)** in `docs/spec/EXECUTION-PLAN.md`; this is an
early, self-contained slice of that milestone landing ahead of the rest.

## What's here

- `src/ag-ui-events.ts` — a minimal, hand-rolled AG-UI-shaped event union.
  `@ag-ui/*` is pre-1.0 and not yet installed anywhere in this repo
  (TECH-STACK.md T-004's hardening note); this type is deliberately shaped to
  make swapping in the real package later a mechanical rename.
- `src/mapper.ts` — `AGUIMapper`, the pure, I/O-free ACP `session/update` →
  AG-UI event mapper (T-004's event-mapping table): message chunks → text
  streaming events, thought chunks → thinking events, tool calls → tool-call
  events, plan updates → `STATE_DELTA`. Includes the GU-012 fenced
  `ibuildos:component` scanner (FORMATS.md §10 carrier B), which buffers
  correctly across `session/update` chunk boundaries.
- `src/permission.ts` — maps `session/request_permission` to a `HITL_INTERRUPT`
  AG-UI event, and encodes the human's answer as the JSON-RPC result the
  agent's `sendRequest` is awaiting.
- `src/component.ts` — encodes a `ComponentAnswer` (from `@ibuildos/schemas`)
  as the fenced `ibuildos:answer` block + prose restatement FORMATS §10
  specifies, and extracts/validates one back out of assembled text.
- `src/jsonrpc-client.ts` + `src/client.ts` — the minimal ACP client (JSON-RPC
  over stdio) needed to drive the mapper against a real agent process. Not
  the eventual production ACP client (`packages/acp`'s M3 scope) —
  independent of it by design, and independent of `@ibuildos/stub-agent` too
  (only test code imports that).
- `src/run-scenario.ts` + `src/spawn.ts` — test-support: spawns
  `@ibuildos/stub-agent` as a real child process (via `tsx`, since nothing in
  this repo compiles TS to JS ahead of time) — either the shipped CLI against
  its own built-in scenarios, or this package's own driver against
  `fixtures/*.json` for scenarios the shipped CLI can't reach.

## What's explicitly not here

- **IPC wiring into `apps/desktop`.** `apps/desktop/src/shared/ipc/contract.ts`
  is mid-edit by sibling work this round; wiring the bridge's event stream
  into the real app's typed IPC router (T-008) is deferred to a later round.
- **Carrier A, the bundled `ibuildos-ui` MCP server** (FORMATS §10's preferred
  component-emission carrier). Only carrier B (the fenced-block fallback) is
  implemented and tested here — carrier A needs an actual MCP server, out of
  scope for this round.
- A production ACP client (`packages/acp`, M3) and the real
  `@copilotkit`/`@ag-ui` packages (T-004's hardening gate applies once those
  land).

## Testing

`pnpm --filter @ibuildos/bridge test` runs both pure unit tests
(`mapper.test.ts`, `permission.test.ts`, `component.test.ts`) and real
child-process integration tests (`bridge.integration.test.ts`) that spawn
`@ibuildos/stub-agent` exactly as `packages/acp`'s own test suite does,
independently — see `docs/decisions/dc-0001.md` for the runtime-shape
decision this module was built under.
