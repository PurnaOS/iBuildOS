# CLAUDE.md — durable rules for iBuildOS v2

iBuildOS v2 is a **desktop application** (Electron/TypeScript) where a product
person and an architect drive parallel AI coding agents — via the open
**Agent Client Protocol (ACP)** — through a UI, with the git repository (code +
OKF documents) as the single source of truth. It replaces the v0.5 CLI-first
traceability linter (archived at branch `archive/v1-cli` / tag `v1-cli-archive`,
also pushed to `origin`) — **no v0.5 code carries forward** (SPEC.md decision
D-103); concepts do, re-specified fresh.

## Document precedence — read in this order when in doubt

All governing documents live in `docs/spec/`. When two documents seem to
disagree:

1. **`docs/spec/SPEC.md`** (v1.2) — intent and behavior. The requirement catalog
   (`AREA-NNN` IDs, e.g. `RQ-006`), un-phased and scope-complete by design.
2. **`docs/spec/FORMATS.md`** — bytes. Every on-disk format, ID grammar, wire
   contract. **Authoritative on bytes** — per its own text, "a conflict is a bug
   in this annex," meaning FORMATS wins over SPEC on byte-level questions.
3. **`docs/spec/TECH-STACK.md`** (v1.1) — technology decisions (`T-NNN`):
   Electron, TypeScript everywhere, pnpm + Turborepo, official ACP TS SDK,
   CopilotKit + AG-UI, system git CLI, custom engine, Vitest + Playwright.
4. **`docs/spec/DEFAULTS.md`** — the 20 shipped policy defaults (autonomy dial,
   concurrency caps, retention windows, …) where SPEC/TECH-STACK left a choice
   open.
5. **`docs/spec/ACCEPTANCE.md`** — the 252 "done when" oracles, one per
   requirement, plus four end-to-end narratives (N1–N4) that exercise them
   together.
6. **`docs/spec/EXECUTION-PLAN.md`** — delivery sequencing (milestones M0–M8)
   and the **Builder Charter**: how an autonomous builder makes and records
   in-session decisions (as `DC-…` Decision artifacts tagged `builder-decision`,
   reviewed post-hoc — never blocking on a question that has a reasonable
   default).
7. **`docs/spec/DESIGN-CHARTER.md`** — design tokens, navigation map, and the
   Product-mode vocabulary glossary (PS-006 bans git/engineering jargon there).
8. **`docs/spec/PROVISIONING.md`** — human-only blockers (accounts, signing
   certs, npm scope) — not something an agent session can resolve.

`docs/spec/REQUIREMENTS.md` (the old v0.5 catalog) and the three
`*-JOURNEY.md` docs are earlier-round material with a **different ID
namespace** than SPEC.md's areas — mine them for ideas only; never try to
reconcile their IDs with SPEC.md's. `BUILD-READINESS.md` and `REVIEW-GAPS.md`
are closed audits (findings G-01..G-41, folded into the v1.1 documents above)
— reference, don't re-litigate.

## Non-negotiables

1. **ACP is the only door to AI.** No bundled model, no direct LLM API path in
   the product (SPEC D-110/AC-001). All intelligence — interviewing, breakdown,
   coding, review — arrives through ACP agent sessions the user configures with
   their own auth.
2. **The repo is the record.** Every fact that matters (requirement, story,
   test, decision, run, release) is a version-controlled OKF document. UI state
   is derived, never authoritative. Machine-local state (transcripts, secret
   values, agent auth) lives outside the repo, keyed to the project's stable
   ULID (FORMATS §7, PS-014) — never committed.
3. **Deterministic first, AI second.** The validation/gate engine
   (`packages/engine`) has no AI and no network. It is the sole authority on
   "done"; no agent and no human opinion overrides a red gate on the trunk.
4. **Self-describing process.** Artifact types, fields, statuses, links, and
   gates are data in `docs/profile/*.md` (the type-profile dialect, FORMATS
   §5), not logic in the app. `ProfileRegistry` (packages/engine) knows only
   the `TypeDefinition` meta-format natively.
5. **Worktree isolation.** All agent repository work happens inside an
   isolated git worktree bound to one stream; the trunk checkout is never an
   agent workspace (BD-003).
6. **Autonomy is a dial, not a debate.** `step` / `cruise` / `auto` — the same
   pipeline serves every level; decision points (agent questions, secret
   requests, breakdown/change-set approvals) always stop regardless of dial;
   red gates always stop (BD-004).

## Monorepo layout (TECH-STACK.md §3)

pnpm workspaces + Turborepo.

```
packages/
  schemas/      zod types: artifact frontmatter (FORMATS §4), type-profile
                dialect (§5), GU component envelope (§10), config (§7),
                findings/baseline JSON (§8/§12), flow-record frontmatter (§9)
  engine/       OKF store (CST-preserving parse/serialize), type-profile
                registry, rule/gate engine, graph, scheduler, contract runner
  acp/          ACP client layer, agent registry, permission broker (M3)
  bridge/       ACP↔AG-UI bridge, generative-UI component catalog (M5)
  cli/          @ibuildos/cli — bin `ibuildos` (not `iBuild` — DEFAULTS #13)
  stub-agent/   scripted ACP agent over real JSON-RPC/stdio — no live model
                in CI, ever (T-013)
  action/       GitHub Action wrapping the CLI (M8)
apps/
  desktop/      Electron main/preload/renderer (M4+)
templates/      starter app templates (Next.js/Hono/Astro) — later
e2e/            Playwright narratives — later
```

Packages not yet scoped to the current milestone are placeholder
`package.json` + `README.md` stubs (no fabricated source) — see each
package's README for which milestone in EXECUTION-PLAN.md populates it.

## The gate (run on every change)

- `pnpm typecheck` (`turbo run typecheck`) — strict TypeScript across every
  package.
- `pnpm test` (`turbo run test`) — Vitest. `packages/engine`'s suite includes
  OKF round-trip byte-fidelity (parse→serialize with no edits reproduces the
  source exactly) and scalar-edit minimal-diff tests — do not weaken these;
  they're the S-5 spike's ongoing regression guard.
- Full milestone exit criteria (golden-repo fixtures validating identically
  across OS/app/CLI, the four narrative E2E runs, etc.) are in
  `EXECUTION-PLAN.md` §4 per milestone — this file states standing rules, not
  the plan itself.

## Editing the OKF store

`packages/engine/src/store/okf-document.ts` operates on the `yaml` package's
**CST layer**, not its `Document` API — `Document#toString()` reformats
comment spacing and flow-collection bracket padding even when nothing
semantic changed (confirmed empirically; this is TECH-STACK's G-41
correction). Scalar value edits go through `CST.setScalarValue` on the
specific token (`setScalarField`), producing a true single-line diff.
Structural edits (add/remove a field, append to a sequence) need a separate
owned token-splice layer — not yet built; don't fake it with `Document#set`.

## Fixtures

`packages/engine/fixtures/` holds the FORMATS.md-normative golden examples
(the worked Story artifact, its TypeDefinition, a baseline.json) plus a
minimal but real type-profile (`WorkItem`/`Story`/`Requirement`/`TestCase`/
`DesignDirection`/`Task`/`Epic`) sufficient for `ProfileRegistry` meta-
validation to pass, and invalid counter-examples per implemented rule. This is
a conformance-fixture stub, not the shipped default profile (SPEC.md §11's
full type tree) — that's further M1 work.
