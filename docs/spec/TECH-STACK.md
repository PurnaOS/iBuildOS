---
type: TechStackDecision
title: "iBuildOS — Technology Stack (UI-Driven Round)"
description: >-
  The implementation stack for SPEC.md v1.0: Electron + TypeScript everywhere, official ACP SDK
  with pluggable agents (Claude Code, Codex CLI, pi at tier-1), CopilotKit + AG-UI for the
  conversational/generative layer, system git with worktrees, and an npm-distributed headless CLI.
status: draft
version: 1.1.0
date: 2026-08-14
owner: srini
tags: [ibuildos, tech-stack, electron, typescript, acp, ag-ui, copilotkit]
implements: SPEC.md §12 "deliberately open" items
---

# iBuildOS — Technology Stack

> **How to read this.** Each choice is a decision (`T-0NN`) with rationale, alternatives
> considered, and the SPEC.md requirements it serves. The spec stays implementation-neutral;
> this document is where technology gets named. Anything not decided here defaults to the most
> conventional choice available at build time.
>
> **Revision 1.1.0 (2026-08-14).** Applies the gap review (`REVIEW-GAPS.md` G-05, G-07, G-09,
> G-17, G-35..G-42): T-008 decision flipped to the in-house IPC router, CopilotKit hardening
> requirements added, adapter/engine pinning and recovery posture corrected, Windows and
> Linux-keyring pitfalls addressed, seven risk rows added, all five spikes expanded.

---

## 1. Stack at a glance

| Layer | Choice | Why (one line) |
|---|---|---|
| Desktop shell | **Electron** | Node in-process for the TS core; Chromium-consistent embedded previews with console capture (PV-007) |
| Language | **TypeScript everywhere** (Node active LTS) | One language for core, ACP, CLI, UI — and for the agents that will build it |
| UI | **React 19 + Vite + Tailwind + Radix** | Conventional, component-rich, CopilotKit-compatible |
| Conversation & generative UI | **CopilotKit + AG-UI protocol** | Event-standard chat, generative UI, human-in-the-loop; bridged to ACP |
| Agent integration | **Official ACP TypeScript SDK**; agents as stdio child processes | The spec's protocol (AC-001), first-party SDK |
| Tier-1 agents | **Claude Code · Codex CLI · pi** | User-selected launch set; registry stays open (AC-002) |
| Git | **System git CLI** (argv, no shell), worktrees | Fidelity with what agents do; worktree support; zero binding risk |
| Knowledge engine | **Custom TS engine**: `yaml` (CST round-trip), Ajv escape hatch, custom rule/graph engine | Deterministic round-trip editing + profile-driven validation (KB/VG) |
| Main↔renderer API | **In-house typed IPC router + zod schemas** *(1.1)* | End-to-end types, subscription events, no unmaintained wrapper deps |
| Headless CLI | **`@ibuildos/cli` on npm** (same core package) | CI parity (VG-010) with one engine, one codebase |
| Secrets | **OS keychain via Electron `safeStorage`** | PV-005 / NFR-007 |
| Preview | **WebContentsView** panes + contract-run dev servers (`execa`) | Embedded, capture-enabled previews (PV-001..007) |
| Templates (initial) | **Next.js web app · Hono API service · Astro static site** | Agent-familiar stacks with clean contract commands (TP-001..003) |
| Testing | **Vitest + Playwright (Electron) + scripted stub ACP agent** | Deterministic integration tests without live models |
| Packaging | **electron-builder + electron-updater**, GitHub Releases | Standard auto-updating desktop distribution |
| Monorepo | **pnpm workspaces + Turborepo** | Shared types across ~9 packages, cached builds |

---

## 2. Decisions

### T-001 — Desktop shell: Electron

**Decision.** The desktop app is Electron: TS core runs in the main process; UI in the renderer;
previews and agent I/O managed by main.

**Why.**
- **Previews are the product.** SPEC PV-001..007 makes the embedded, *instrumented* preview the
  product person's feedback loop. Electron's `WebContentsView` embeds the user's running app,
  and Electron's instrumentation surface — `console-message` events, per-preview session
  partitions with `webRequest` for request outcomes, and a preload error hook (see T-011,
  *amended 1.1*) — delivers what PV-007 ("feed the stack trace to the agent") requires. And
  because it is Chromium on every OS, the PM's preview renders identically on macOS, Windows,
  and Linux.
- **One process family.** The TS core (engine, scheduler, ACP layer) runs directly in Electron's
  Node main process — no sidecar, no FFI, no second language.
- **Operational maturity.** Process management for many children (agents, dev servers, git),
  multi-window, tray, notifications, auto-update, crash recovery are all well-trodden.

**Alternative considered — Tauri 2.** Dramatically smaller installs and RAM; Rust host pairs with
the ACP Rust SDK. Rejected for this product because: previews would render in *different* web
engines per OS (WebKitGTK on Linux — the user's app may genuinely behave differently than in
their users' browsers); embedded-webview instrumentation is thinner; and the TS core would run as
a sidecar process, adding an IPC boundary exactly where we want none. Footprint is the accepted
cost (NFR-003 is about responsiveness, which Electron handles fine with work kept in main/workers).

**Serves:** PS-001, PV-001..007, NFR-003, NFR-011.

### T-002 — Language & runtime: TypeScript everywhere

**Decision.** Every package — core engine, ACP layer, bridge, CLI, renderer — is strict
TypeScript on Node (active LTS). Monorepo via pnpm workspaces + Turborepo.

**Why.** One type system end-to-end (a `Requirement` type flows from engine to IPC to React
props); the official ACP SDK is TypeScript; the previous round proved TS validation performance
comfortably meets NFR-004; and — dogfooding — coding agents building iBuildOS are strongest in
TypeScript, which matters when the tool is built the way it says software should be built.

**Alternative considered — Rust core + TS UI.** Performance headroom and Tauri synergy, rejected
with Tauri: two languages double the contribution surface and slow iteration where speed is not
the bottleneck. Revisitable per-module later (NFR: engine is a clean package boundary).

**Serves:** NFR-004, NFR-014, dogfooding (NFR-015).

### T-003 — UI: React 19 + Vite + Tailwind CSS + Radix primitives

**Decision.** Renderer is React 19 (Vite-built), styled with Tailwind + Radix-based components
(shadcn/ui approach — components owned in-repo, not a locked library), state via Zustand +
TanStack Query over the IPC API, TanStack Virtual for large lists (artifacts, findings, logs),
Shiki for syntax highlighting, and an in-house unified diff view. No Monaco/editor embed — the
spec's "not an IDE" boundary keeps code read-only in-app.

**Why.** The most conventional, component-rich path; CopilotKit (T-004) is React-first;
design-system control stays ours (dual-mode UI is a bespoke design, Linear/Conductor aesthetic).

**Serves:** PS-003, PS-006..010, RV-005, NFR-003/011.

### T-004 — Conversation & generative UI: CopilotKit + AG-UI, bridged to ACP

**Decision.** The conversational layer adopts the **AG-UI protocol** with **CopilotKit** as the
renderer-side runtime (chat surfaces, streaming, generative UI components, human-in-the-loop),
per the user's explicit choice. Because all intelligence arrives via ACP (SPEC D-110/AC-001),
the Electron main process hosts an **ACP↔AG-UI bridge**: from CopilotKit's perspective it is an
AG-UI agent endpoint; from the agents' perspective it is an ACP client.

**Event mapping (the bridge's contract):**

| ACP (from agent sessions) | AG-UI (to CopilotKit) |
|---|---|
| `session/update` agent message chunks | text-message streaming events |
| `session/update` thought chunks | thinking/reasoning events |
| `session/update` tool calls + updates | tool-call events (+ our rendering) |
| `session/update` plan updates | shared-state deltas (plan object) |
| `session/request_permission` | human-in-the-loop interrupt → approval component → response |
| our component emissions (GU catalog) | generative-UI components (typed) |
| user submits form/card | next `session/prompt` turn (structured content) |

The **component catalog** (SPEC GU-002..009: question forms, plan/change-set cards, decision
cards, progress cards, review summaries) is implemented as CopilotKit generative-UI components
with versioned zod schemas — the catalog remains ours and versioned even though the runtime is
CopilotKit's. Agent-side component emission follows the published **component-emission
convention** (SPEC GU-012): typed payloads carried in `session/update` content, taught to
agents via role instructions; the bridge maps them to AG-UI generative-UI events, with prose
fallback for agents that don't emit them *(1.1, G-42)*.

**Hardening requirements (1.1, G-39).** The CopilotKit runtime's dependency tree includes
multiple vendors' LLM SDKs (unused by us but present), Segment-based opt-out telemetry,
install-time Scarf analytics, and a license-verifier package. Build rules, non-negotiable:
telemetry hard-disabled **in code** (not env vars); Scarf and license-verifier behavior
verified/neutralized at install and build; `@copilotkit/*` and `@ag-ui/*` (pre-1.0, expect
churn) pinned **exactly** per release; a dependency-audit gate for every main-process package.
The runtime endpoint, if hosted in main, binds loopback-only on a random port with a per-launch
bearer token — or we run runtime-less with a custom AG-UI client over IPC; **Spike S-2 decides
between these two shapes** and proves the component round-trip before anything is built on it.

**Risk owned.** AG-UI's first-party integrations target agent frameworks (LangGraph, ADK, …),
not ACP — the bridge is novel surface, and hosting the runtime inside Electron is off the
vendor's documented map. Mitigations: the bridge is one thin, contract-tested module (tested
against the stub agent, T-013); if the CopilotKit runtime ever fights us, the bridge's AG-UI
event stream feeds a native renderer without touching the agent side.

**Serves:** GU-001..011, RQ-006, BD-012, and the spec's GU-010 posture (protocol adoption).

### T-005 — Agent integration: official ACP TypeScript SDK + adapter registry

**Decision.** The ACP layer uses the official **`@agentclientprotocol/sdk`** (TypeScript,
client role) *(name corrected 1.1)*. Agents run as stdio child processes — one process per
stream for isolation — one session per stream/conversation.

**Tier-1 agents (installed-by-default definitions, documented; CI covers install, handshake,
and contract-shape against pinned adapter versions — behavioral verification is the scheduled
live matrix, T-013 — 1.1, G-38):**

| Agent | Connection | Notes |
|---|---|---|
| **Claude Code** | `@agentclientprotocol/claude-agent-acp` (official adapter over the Claude Agent SDK) | Reference agent; session/load, permission modes |
| **Codex CLI** | `@agentclientprotocol/codex-acp` (official adapter) | Second major vendor |
| **pi** | `pi-acp` community adapter (native ACP under upstream discussion) | Minimal open harness; we treat the adapter as ours to patch if upstream lags |

Tier-2 (registry entries shipped, not in the test matrix): Gemini CLI (native ACP mode), Goose,
OpenCode, Qwen Code, and anything the user adds (AC-002 — launch command + args, no app update).

**Implementation notes.** Capability negotiation cached per agent (AC-003); the app serves
`fs/read_text_file`, `fs/write_text_file`, and `terminal/*` scoped to the session's worktree
(AC-007) — worktree scoping is enforced in our handlers for ACP-served access, and directed +
audited for agent-native OS access (SPEC §8, honest trust model); permission broker maps
`session/request_permission` → policy (AC-006) → auto-grant or GU decision card, with secret
requests routed to the keychain flow (AC-013), never chat. Transcripts are **machine-local
JSONL in app storage** (gitignored, secret-redacted), referenced — never committed — by run
artifacts *(amended 1.1, G-07)*. MCP server configs passed through at `session/new` where the
agent supports it (AC-009). **Recovery posture (1.1, G-40):** context re-establishment (fresh
session + AC-010 context injection + the per-task commit ledger) is the *designed* resume path;
`session/load` is an optimization used when the agent/adapter supports it reliably — adapters
pin their embedded engines, users' standalone CLIs auto-update independently, and session state
has been observed not to survive engine bumps.

**Serves:** AC-001..012, EX-001, BD-001/003.

### T-006 — Version control: system git CLI

**Decision.** All git operations shell out to the system `git` (argv arrays, never a shell
string), including worktree lifecycle (`git worktree add/remove`), merges, and remotes.
Minimum supported git ≥ 2.40. Credentials via git's own credential machinery. *(1.1, G-37)*
Windows: `core.longpaths` + OS long-path support are configured/verified at project setup
(worktrees × `node_modules` exceed MAX_PATH otherwise); per-worktree installs use pnpm's
shared content-addressable store (hardlinks, same volume) so N worktrees don't mean N full
dependency trees or N full install times.

**Why.** Worktrees, merge machinery, and attribution must behave *identically* for the app and
for agents running `git` in their terminals — one implementation guarantees that. Bindings
rejected: isomorphic-git (incomplete worktree/merge fidelity), nodegit/libgit2 (maintenance and
ABI drag).

**Serves:** GH-001..004, BD-003, IG-*, NFR-006.

### T-007 — Knowledge engine: custom TS core

**Decision.** The engine (own package, zero Electron imports) implements:

- **OKF store** — parse/serialize markdown + YAML frontmatter with **round-trip fidelity**,
  LF + UTF-8 enforced (KB-007). *(1.1, G-41)* Two-tier editing strategy: the `yaml` library's
  CST `setScalarValue` for value edits (change one field → one-line diff), plus a small
  **owned token-splice layer** for structural edits (add field, remove field, append to
  sequence) — the CST API has no utilities for those, and Document-mode re-stringify reformats
  the whole frontmatter. Document-mode fallback is flagged as a formatting-changing operation.
- **Type-profile registry** — meta-type validation, `extends` resolution, status/transition
  tables, gate definitions — all loaded from repo data (KB-003..006); Ajv only for the
  `json_schema` escape hatch.
- **Rule & gate engine** — deterministic rules (fields, links, cardinality, chain, statuses)
  with per-rule severity, baseline fingerprinting (VG-008), and named gate bundles (VG-004);
  incremental: file-watch (`@parcel/watcher`) → dirty-set revalidation in milliseconds (VG-002).
- **Graph & queries** — in-memory typed graph with reverse indexes; impact, matrix, coverage,
  release-scope queries (TR-*); JSON exports (NFR-013).
- **Scheduler & streams** — dependency-aware queue (ST-005/BD-007), worktree + branch + session
  lifecycle, per-task commit ledger, merge queue with rebase policy (IG-002/007), all state
  recoverable from repo + a small journal (BD-014).
- **Contract runner** — `execa`-managed processes for dev/test/lint/seed/build/deploy commands
  with structured output capture (TP-004, TX-001, DR-003).

**Serves:** KB-*, VG-*, TR-*, BD-*, IG-*, NFR-004/005/006.

### T-008 — Main↔renderer API: in-house typed IPC router

**Decision.** *(revised 1.1, G-41 — was "electron-trpc or equivalent")* A **hand-rolled,
zod-validated IPC router** (~300 lines) over `ipcRenderer`/`MessagePort`: typed
queries/mutations plus subscription channels for live events (validation ticks, stream updates,
gate results, AG-UI event stream). Schemas live in a shared package so engine, bridge, CLI, and
UI import identical types. electron-trpc is demoted to prior art: unmaintained since 2024, two
tRPC majors behind, forked ecosystem — exactly the wrong dependency for the preload trust path.

**Serves:** PS-008, NFR-003, engineering sanity.

### T-009 — Headless CLI: `@ibuildos/cli` on npm

**Decision.** The CLI is a thin command surface over the same engine package, bundled
(esbuild) and published to npm as `@ibuildos/cli` with bin **`ibuildos`** (`ibuild` is taken on
npm — DEFAULTS #13): `ibuildos validate`, `ibuildos gate <name>`, `--format json`,
exit codes for CI (VG-010), plus an annotate-only mode. A maintained GitHub Action wraps it
with PR annotations and **installs the repo-declared engine version** (SPEC VG-012) rather
than a floating tag *(1.1, G-17)*. CLI secrets come from process env only — the CLI cannot and
does not read safeStorage *(1.1, G-09)*. CI pins its Node to Electron's bundled Node major so
engine behavior matches the app (NFR-005). Standalone binaries (Node SEA) are a later
convenience, not a launch requirement.

**Serves:** VG-010, NFR-005, CI parity.

### T-010 — Secrets & environments

**Decision.** Secret values encrypted at rest via Electron `safeStorage`, keyed per **stable
project id** (SPEC PS-014) + environment; injected as env vars into contract-run processes per
policy (user-initiated preview/deploy by default; agent-triggered runs only where per-variable
policy allows, SPEC TP-008/AC-013). The repo stores environment *definitions* (names,
non-secret defaults) as artifacts (PV-005). A committed-secret detection rule ships bound to
the `stream-done` and `merge` gates. *(1.1, G-09)* At startup the app checks
`getSelectedStorageBackend()`: on Linux `basic_text` (no OS crypto — keyring absent) it warns
and **refuses to store secrets** unless the user explicitly opts in; packaging documents
keyring prerequisites (gnome-keyring/kwallet) for deb/AppImage.

**Serves:** PV-005, NFR-001/007.

### T-011 — Preview runtime

**Decision.** Preview panes are `WebContentsView`s pointed at contract-launched dev servers
(`execa` with `killDescendants` tree-kill, port-liveness checks, and health-checked restarts —
Windows termination is abrupt, so restart-not-signal is the recovery primitive *(1.1, G-37)*).
Capture mechanics *(1.1, G-41)*: **one session partition per preview** so traffic attributes
correctly with concurrent previews; `webRequest` for request outcomes; `console-message` for
logs; a preload hook in the preview partition for `window.onerror`/`onunhandledrejection` —
together delivering PV-007's one-click "attach to bug / feed to stream" (captures machine-local
and redacted per AC-012). Non-web targets get derived interaction surfaces per SPEC PV-008 or
external launch with the same process management. Trunk preview and stream previews are the
same machinery, different worktrees; migrate/seed re-runs on source change per SPEC PV-009.

**Serves:** PV-001..007, RV-003.

### T-012 — Starter templates (initial set)

| Template | Stack | Contract highlights |
|---|---|---|
| **Web app** | Next.js + TypeScript + Tailwind + SQLite (Drizzle) | dev/test (Vitest + Playwright)/lint/seed/build; deploy: Vercel CLI target |
| **API service** | Hono + Node + SQLite (Drizzle) + Vitest | dev/test/lint/seed; deploy: Fly.io CLI target |
| **Static site** | Astro + Tailwind | dev/test/lint/build; deploy: Vercel or Netlify CLI target |

Chosen for agent familiarity (heavily represented in training data → reliable generation),
simple local execution (SQLite — no external services), and clean one-command deploys via
provider CLIs (DR-003). Templates live in their own repos with the TP-003 guarantee enforced by
template CI: scaffold → gates green → tests pass → preview serves, on every template change.

**Serves:** TP-001..003/007, DR-003, PM-persona reliability (SPEC N6).

### T-013 — Testing strategy

- **Unit:** Vitest across all packages; engine determinism suites (OKF round-trip byte
  fidelity, same-input→same-findings, baseline fingerprint stability).
- **The stub agent:** a scripted ACP agent (own package, speaks real ACP over stdio, replays
  scenario scripts — messages, tool calls, permission requests, plans, edits). Powers
  deterministic integration tests of the ACP layer, the AG-UI bridge, streams, gates, merges,
  and conflict flows — no live model in CI, ever.
- **E2E:** Playwright driving the built Electron app through the four SPEC §7 narratives
  (with the stub agent), on macOS + Windows + Linux runners.
- **Scheduled live-agent matrix** *(1.1, G-38)*: a nightly/weekly **non-blocking** job running
  S-1's round-trip against the current pinned adapters (Claude Code, Codex, pi) on all three
  OSes with a dedicated low-cost account — so adapter drift surfaces before users, not on them.
  Real sessions are recorded and replayed as stub scripts, keeping stub fidelity anchored to
  reality.
- **Live smoke (manual, pre-release):** the full narratives against real Claude Code / Codex /
  pi on a maintainer machine.

**Serves:** NFR-005/006, BD-014, IG-004, and honest CI.

### T-014 — Packaging & distribution

electron-builder for installers (dmg/msi/AppImage+deb), electron-updater against GitHub
Releases for auto-update — **with update installs deferred while streams, merges, or deploys
are active** (idle-only restarts; BD-014 makes a forced restart recoverable, but we don't
volunteer one) *(1.1, G-17)*. macOS notarization + Windows signing in the release pipeline.
The CLI releases to npm in lockstep with the app (same engine version; VG-010 parity is a
release gate) — and per-repo engine pinning (SPEC VG-012) is what actually protects teams from
install-base skew, since lockstep releases can't synchronize installations.

---

## 3. Monorepo layout

```
ibuildos/
├── packages/
│   ├── engine/        # T-007: OKF store, profiles, rules/gates, graph, scheduler, contract runner
│   ├── acp/           # T-005: ACP client layer, agent registry, permission broker, transcripts
│   ├── bridge/        # T-004: ACP ↔ AG-UI translation, component catalog schemas
│   ├── schemas/       # shared zod types: artifacts, IPC contract, GU components, config
│   ├── cli/           # T-009: @ibuildos/cli
│   ├── stub-agent/    # T-013: scripted ACP agent for tests
│   └── action/        # GitHub Action wrapping the CLI
├── apps/
│   └── desktop/       # Electron main (+ preload) and React renderer (T-001/003)
├── templates/         # T-012 (or separate repos, decided at template CI setup)
└── e2e/               # Playwright narratives
```

---

## 4. Requirement → stack traceability (spot checks)

| Spec clause | Honored by |
|---|---|
| AC-001 ACP-only AI | T-005 — the **agent path** makes no LLM API calls anywhere. *(corrected 1.1, G-39)* Note: CopilotKit's runtime dependency tree includes vendor LLM SDKs (unused by us); see T-004 hardening + risk table |
| PV-007 preview diagnostics → agent | T-001 + T-011 (WebContentsView capture wired to sessions) |
| VG-002/NFR-004 ambient validation | T-007 incremental engine + watcher |
| VG-010 UI/CI parity | T-009 (one engine package in both) |
| BD-003 worktree scoping | T-005 fs/terminal handlers + T-006 worktrees |
| GU catalog + D-110 | T-004 bridge + CopilotKit generative UI |
| KB-007 clean diffs | T-007 CST round-trip editing |
| NFR-001 local-first | No service anywhere in this document |

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| ACP↔AG-UI bridge is novel surface; runtime-in-Electron off vendor's map | Spike S-2 first (decides runtime-in-main vs runtime-less client); thin contract-tested module; native-renderer fallback keeps agent side untouched |
| **CopilotKit dependency weight & telemetry posture** *(1.1)* | T-004 hardening: telemetry disabled in code, Scarf/license-verifier neutralized, exact pins, main-process dependency-audit gate; loopback+token endpoint if runtime hosted |
| **Prompt injection → contract-command escalation** *(1.1)* | Trunk-resolved commands for stream runs; contract/script-modifying streams flagged + approval-gated (TP-008); least-privilege env; OS sandboxing as hardening (NFR-007) |
| **Secrets leak via transcripts / preview logs into repo** *(1.1)* | Transcripts & captures machine-local + gitignored (AC-012); known-value redaction pass; committed-secret rule on stream-done + merge |
| **Shared-quota exhaustion under parallelism (429s)** *(1.1)* | Throttling = backpressure (BD-016): auto-pause + backoff + concurrency downshift + one aggregate notice; per-account burn in Insights; stall-and-resume tested with stub agent |
| Adapter/protocol version drift — and **adapters pin their embedded agent engines** while users' CLIs auto-update; session state may not survive engine bumps *(1.1)* | Adapters pinned per release; re-establishment is the designed recovery (T-005); resume-after-upgrade in S-1; scheduled live matrix (T-013); registry lets users override versions |
| Electron footprint — dominated by **per-stream agent + dev-server + preview processes** (~0.3–1.5 GB/stream), not the shell *(1.1)* | S-4 measures full triples on all 3 OSes; data-derived stream caps (BD-015) + preview idle-shutdown; work stays in main/workers; virtualized UI |
| **Windows process/path semantics** *(1.1)* | `killDescendants` + port-liveness + health-checked restarts (T-011); pnpm shared store + `core.longpaths` (T-006); S-4 on a Windows runner |
| **Auto-update landing mid-stream / engine skew across a team** *(1.1)* | Idle-only update installs (T-014); per-repo engine pin honored by app, CLI, and Action (VG-012) |
| Long-running agent session stability | Per-task commits (BD-006) + session re-establishment (BD-014); crash-only design |
| Worktree disk growth | Worktree GC on stream close; size surfaced in Insights (IN-007) |
| Template deploy CLIs change | Templates version-pinned + template CI (TP-003 guarantee) catches drift |

---

## 6. Validation spikes (run before committing the execution plan's foundations)

- **S-1 — ACP round-trip:** drive `claude-agent-acp` and `codex-acp` from the SDK: session,
  streamed updates, a permission request, an edit landing in a worktree — **plus resume after
  an adapter version bump** (re-establishment path) and a simulated 429/stall-and-resume
  *(1.1)*. Proves T-005/BD-016.
- **S-2 — Bridge proof & runtime decision:** stub agent → bridge → CopilotKit rendering a
  streamed message, a tool call, and one decision card whose answer returns as a prompt turn —
  **implemented both ways** (runtime hosted in main over hardened loopback vs runtime-less
  custom AG-UI client over IPC) with a decision recorded; includes the component-emission
  convention (GU-012) end-to-end and verification that telemetry is provably disabled *(1.1)*.
  Proves T-004.
- **S-3 — Preview capture:** **two concurrent previews** on template dev servers with separate
  session partitions; capture a thrown page error, an unhandled rejection, and a failed fetch
  **with correct per-preview attribution**; attach to a session prompt *(1.1)*. Proves
  T-011/PV-007.
- **S-4 — Worktree & footprint scale:** 20 concurrent worktrees + commits + merges on a
  mid-size repo; **measure RSS of full stream triples (agent process + dev server + preview)**
  and derive default stream caps; run on macOS, **Windows** (long paths, tree-kill), and Linux
  *(1.1)*. Proves T-006/BD-002/BD-015 assumptions.
- **S-5 — Round-trip determinism:** CST-based edits across a corpus of gnarly YAML (comments,
  anchors, CRLF) with byte-stable non-target content — covering **set-value, add-field,
  delete-field, and append-to-sequence** (the owned token-splice layer), not just scalar sets
  *(1.1)*. Proves T-007's foundation.

---

## 7. Decision log

| ID | Decision | Status |
|---|---|---|
| T-001 | Electron desktop shell | Decided (user, 2026-08-13) |
| T-002 | TypeScript everywhere, Node LTS, pnpm+Turborepo | Decided (user, 2026-08-13) |
| T-003 | React 19 + Vite + Tailwind + Radix; no embedded IDE | Decided (default, unchallenged) |
| T-004 | CopilotKit + AG-UI adopted fully; ACP↔AG-UI bridge in main | Decided (user, 2026-08-13) |
| T-005 | Official ACP TS SDK; tier-1 = Claude Code, Codex CLI, pi | Decided (user, 2026-08-13) |
| T-006 | System git CLI, worktrees, git ≥ 2.40 | Decided (default) |
| T-007 | Custom TS engine; `yaml` CST; Ajv escape hatch | Decided (default) |
| T-008 | In-house typed IPC router + zod (electron-trpc demoted to prior art) | **Revised 1.1** (G-41) |
| T-009 | CLI on npm + GitHub Action | Decided (default) |
| T-010 | safeStorage/keychain secrets | Decided (default) |
| T-011 | WebContentsView previews + execa process manager | Decided (default) |
| T-012 | Templates: Next.js / Hono / Astro | Decided (default; template set is data, extensible) |
| T-013 | Vitest + Playwright + stub ACP agent | Decided (default) |
| T-014 | electron-builder/updater, GitHub Releases, npm | Decided (default) |

**Consciously deferred:** exact dependency versions (pinned at kickoff against then-current
stable); template repo split vs monorepo folder; Node SEA standalone CLI binaries; Gemini
CLI/Goose promotion to tier-1 (registry makes it a data change); OS-sandboxing mechanism per
platform (NFR-007 "should" — hardening track).

**Revision 1.1.0 (2026-08-14):** applied gap-review fixes G-05/07/09/17/35–42 — see the
revision note at the top and `REVIEW-GAPS.md` for the findings this revision answers.

---

## References

- ACP GitHub org (TypeScript SDK, adapters): <https://github.com/agentclientprotocol>
- `@agentclientprotocol/claude-agent-acp`: <https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp>
- `@agentclientprotocol/codex-acp`: <https://www.npmjs.com/package/@agentclientprotocol/codex-acp>
- Gemini CLI ACP mode: <https://geminicli.com/docs/cli/acp-mode/>
- pi (earendil-works): <https://github.com/earendil-works/pi> · ACP discussion: <https://github.com/earendil-works/pi/discussions/4444> · community adapter: <https://github.com/victor-software-house/pi-acp>
- AG-UI protocol: <https://docs.ag-ui.com/introduction> · CopilotKit: <https://github.com/copilotkit/copilotkit>
- Electron `WebContentsView`, `safeStorage`: <https://www.electronjs.org/docs/latest>
- SPEC.md v1.0 (this repo) — the requirements this stack serves.

---

*End of tech-stack decision document. Changes go through review like any other artifact.*
