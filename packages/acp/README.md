# @ibuildos/acp

ACP client layer (TECH-STACK.md T-005, SPEC.md area AC): agent registry
(AC-002), capability negotiation (AC-003), sessions (AC-004), scoped
fs/terminal services (AC-007), permission broker (AC-006), secret-request
routing (AC-013), machine-local transcripts (AC-012), MCP passthrough
(AC-009), and run records (BD-011). Built on the official
`@agentclientprotocol/sdk` (client role), spawning agent processes over real
stdio.

**Status:** M3 implemented — capability negotiation, sessions, scoped
fs/terminal, permission broker, secret routing, transcripts, MCP passthrough,
and run-record building all have unit and/or real-process integration
coverage (`test/`). Not yet wired into a scheduler/stream lifecycle — that's
the sibling `packages/engine` streams/scheduler work (out of this package's
boundary) consuming these modules via the injection seams below.

## Design seams (why the constructors look the way they do)

This package never imports the sibling work it will eventually be driven
by — it takes plain functions/interfaces instead, so it composes without a
build-order dependency:

- `WorktreePathResolver` (`() => string`) — the stream/worktree lifecycle
  lives in `packages/engine`; this package only needs *a* path to scope
  fs/terminal to.
- `PermissionPolicy` (`(request) => "allow" | "deny" | "ask"`) — the
  autonomy dial (BD-004) is a later layer; this is the seam it wraps, not a
  reimplementation of it. `"ask"` resolves via an optional injected
  `PermissionEscalation` callback, or cancels if none is given — an
  escalation is never silently auto-approved.
- `SecretStore` (`get`/`request`) — structurally identical to
  `packages/engine/src/secrets/secret-store.ts`'s interface, but declared
  locally (see "engine's `FakeSecretStore` isn't imported" below).
- `Clock` (`now`/`wait`/`random`) — BD-016 backoff logic is fully testable
  without real sleeping; `runWithBackpressure`'s tests assert on computed
  delays, not wall-clock time.

## Testing strategy: two ACP peers, and why there are two

This package's tests drive TWO different kinds of ACP agent process:

1. **`packages/stub-agent`'s `hello-world` scenario** — the one scenario
   file actually present in this worktree's git history
   (`test/stub-agent-hello-world.test.ts`). It proves the real
   `initialize`/`session/new`/`session/prompt` round-trip against the
   project's designated deterministic test double, and — deliberately — it
   is the test that documents a real, empirically-confirmed gap (below).
2. **This package's own fixture agents** (`test/fixtures/*.mjs`), authored
   directly against the real SDK's `agent()` builder — used for the
   permission-request, secret-request, and throttle legs.

### Why two, not one: `permission-request.json` doesn't exist in this worktree

`packages/stub-agent`'s `agent.ts`/`scenario.ts` support `session/load` and
agent-initiated `session/request_permission`, and a `permission-request.json`
scenario — all described in this milestone's task brief, and all readable in
the shared checkout at `/Volumes/Data/code/AI-Infra/iBuildOS` at the time
this package was built. But `git log --all -- packages/stub-agent/...` in
*this* worktree/repository finds no commit, on any local or remote branch,
that ever added `permission-request.json`, `session-load.json`, or the
fuller `agent.ts`. It exists only as uncommitted state in that other,
shared checkout — which this worktree-isolated session has no reproducible
access to (and no permission to write to, by design: the harness refused
git operations targeting it). Since `packages/stub-agent/**` is this
package's boundary (read-only reference, do not modify), the correct move
was not to copy that uncommitted state into this worktree (that would make
the test suite green here and red in every other checkout — irreproducible)
but to write this package's own fixture agents for the scenarios the
committed stub agent can't yet drive. They're authored against the same
real SDK, so their wire traffic is schema-valid by construction.

### The confirmed wire-format gap (not a bug in this package)

Driving `packages/stub-agent`'s `hello-world` scenario through the real
`@agentclientprotocol/sdk@1.3.0` empirically confirms: **every
`session/update` notification the stub agent sends is silently dropped by
the SDK.** `session/prompt` still resolves with the correct `stopReason` —
the turn "completes" — but zero updates ever reach a
`.onNotification`/`ActiveSession` handler. Root cause, read directly from
the SDK's compiled bundle: `SessionUpdateRouter.handleMessage` calls
`validate.zSessionNotification.parse(message.params)` unconditionally, with
no fallback path, for every inbound `session/update`. The stub agent's
payload shape (`{"kind": "message_chunk", "data": {"text": "..."}}`,
documented in `scenario.ts` as "a reasonable approximation, not yet verified
against the official ACP SDK's wire types") doesn't match the real schema
(`{"sessionUpdate": "agent_message_chunk", "content": {"type": "text",
"text": "..."}}`), so it fails validation and is dropped — logged internally
(visible as stderr noise in this test), but not delivered, and the
connection does not throw.

This is exactly the verification `scenario.ts` says M3 owes. It's captured
as a permanent regression-guard assertion in
`test/stub-agent-hello-world.test.ts`, not worked around: `spawn.ts` taps
every raw inbound JSON-RPC line *before* the SDK validates it, so this
package's transcript writer (`transcript.ts`) is loss-proof against this
class of adapter incompatibility regardless — the same test asserts the
transcript file still has both message chunks, sourced from the raw tap.

### `engine`'s `FakeSecretStore` isn't imported

`packages/engine/src/secrets/secret-store.ts` exports `SecretStore` and
`FakeSecretStore`. This package's `types.ts` declares its own structurally
identical `SecretStore` interface (so the package never needs an `engine`
dependency at all), and `test/helpers.ts` declares a structurally identical
`FakeSecretStore` for the same reason on the test side: `packages/engine`'s
`package.json` publishes only its `"."` export
(`"exports": {".": "./src/index.ts"}`), and its `index.ts` doesn't
re-export `./secrets`, so a cross-package subpath import isn't a reliable
resolution path from here. If `engine` later exports that module properly,
swapping the test double for the real one is a one-line change — the shapes
already match exactly.

### Gap: no BD-016 error-injection scenario in `packages/stub-agent`

`packages/stub-agent`'s `ScenarioUpdateSchema` has no error/throttle kind,
and `agent.ts` only ever throws for an unhandled method — there's no way to
make the committed stub agent return a rate-limit-shaped error. This
package's own `test/fixtures/throttle-agent.mjs` fills that gap with a real
`@agentclientprotocol/sdk`-authored agent that fails its first N
`session/prompt` calls with `RequestError(-32000, "rate limit exceeded
(429): ...")`, so `test/throttle-fixture.test.ts` exercises real over-stdio
429s, not a faked backpressure path.

## Judgment calls worth a `DC-####` decision record

Neither is invented lightly, both are narrow, and both are called out in
code comments at their point of use — flagged here together so they're easy
to find for review/formalization (`docs/decisions/` currently holds only the
pre-rewrite `ADR-####` series; none of them establish the `dc-####.md`
naming FORMATS.md §2 specifies for this round, so one wasn't minted
sight-unseen against a profile/ID scheme this package doesn't own):

1. **The `ibuildos:secret-request` fence info-string** (`component.ts`).
   FORMATS §10 names the MCP tool `ui_request_secret({name, reason})` as
   carrier A for AC-013's secret signal, and states the *answer* shape
   directly (a normal `ibuildos:answer` fence whose `response` is
   `{granted, env}` — not invented here, taken verbatim), but does not name
   a carrier-B fallback fence for the *request* itself. This package's
   `ibuildos:secret-request` fence (`{v, cid, name, reason}`) is that
   extension, scoped narrowly to what's needed to test AC-013 against an
   agent that can't call MCP tools.
2. **The throttle-classification heuristic** (`backpressure.ts`'s
   `classifyThrottleError`). BD-016 says rate limiting is "surfaced via ACP
   or agent exit behavior" but neither SPEC.md nor TECH-STACK.md
   standardizes an error shape for it. This package pattern-matches the
   error message/code (`/rate.?limit|429|throttl/i`, or `code === 429`)
   deliberately erring toward *not* misclassifying an ordinary failure as
   backpressure.
