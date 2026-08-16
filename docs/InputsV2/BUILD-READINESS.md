---
type: ReviewReport
title: "iBuildOS — Build-Readiness Audit: Can an AI Agent Build This With Zero Questions?"
description: >-
  Audit of SPEC.md v1.1 + TECH-STACK.md v1.1 against one test: handed to an autonomous AI
  coding agent with "build this, ask nothing" — where does it stall, what must it invent
  without authority, and what is physically impossible? Verdict, stall inventory, and the
  Build-Ready Kit that flips the answer to yes.
status: draft
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, build-readiness, audit, agent-autonomy]
---

# Build-Readiness Audit

**The question.** *"If I just give this, will an AI agent be able to build the whole thing
without asking the user any questions?"*

**The verdict: No — not yet.** And the shape of the "no" matters: the specification's
*behavior* is unusually complete (the gap review already burned down the ambiguities — internal
consistency is high, decisions are closed, the narratives are executable oracles). What blocks
zero-question autonomy is three different things: **serialization** (18 concrete file formats
and wire contracts are described by behavior but never by bytes — and formats are permanent
public surfaces), **world resources** (9 items — accounts, certificates, subscriptions — that
no document can conjure), and **acceptance** (only 8 of 252 requirements carry an explicit
"Done when"; ~75% have no stated oracle). Plus the execution plan the spec itself references
("sequencing lives in the separate execution plan") does not exist yet.

**How far would an agent get?** Repo scaffold, CI, stub agent, and IPC skeleton proceed
cleanly (~5–10%). The **first hard stall lands on day one**, in the engine's first real file:
you cannot write the OKF store or validator without inventing the type-profile dialect,
frontmatter keys, ID grammar, and rule registry — all load-bearing public formats. An agent
willing to invent boldly without authority reaches roughly **75–80%**: feature-complete against
the stub agent, unsigned, undeployed, never verified against a real coding agent, license-less.
The last 20–25% is hard-walled by world resources regardless of how good the documents are.

**Method.** One independent builder-simulation pass (an agent walking the actual build order
against both documents, instructed to log every forced question or unauthorized invention),
cross-checked against quantified document metrics, with external claims live-verified (OKF
spec, npm registry, package availability). ~40 stalls in six classes.

---

## 1. Scorecard

| Stall class | Count | Worst blast radius | What it means |
|---|---|---|---|
| **FORMAT** — bytes never specified | 18 | HIGH (permanent public surfaces) | The day-one wall; each silent guess is a compatibility decision users inherit forever |
| **WORLD** — human-only resources | 9 | ABSOLUTE (no doc fixes these) | Signing, accounts, subscriptions, budgets — the 20–25% no agent can reach |
| **ACCEPTANCE** — no oracle | 2 (covering ~188 reqs) | MED (silent under/over-building) | Agent can't prove done-ness; 4 areas (PL, TX, EX, DA) have zero oracle of any kind |
| **DESIGN** — UI must be invented | 4 (~35 screens) | MED (iterable but huge volume) | One phrase of visual direction ("Linear/Conductor aesthetic") governs the entire surface |
| **DECISION** — named forks, no default | 5 | MED–HIGH (one is the license) | "Per policy" ×5, S-2's architectural fork, CH-001 significance rules, **no SPDX license named** |
| **SCALE** — no sequencing authority | 2 | LOW–MED | The referenced execution plan is absent; no bootstrap ladder; zero priority signals on 252 reqs |

## 2. The stall inventory (condensed — the full simulation log is preserved below each class)

### FORMAT — the day-one wall (18 items, most HIGH blast)

The five worst, each a permanent on-disk format in every user's git history:

1. **The type-profile "friendly dialect"** (KB-003/004) — the schema-definition language the
   whole product runs on: named, promised open (NFR-016), UI-generating (KB-005),
   version-pinned (VG-012) — and never once shown. Not one example file exists.
2. **Per-type frontmatter keys** (§11) — the data model names fields in prose but never the
   YAML: link serialization shape, criterion-ID syntax (RQ-005's "addressable by ID"), `code`
   glob encoding.
3. **ID grammar + provisional-ID scheme** (KB-010) — the merge queue "finalizes provisional
   IDs, renumbering collisions and rewriting inbound links" — with no grammar for either form
   and no rewrite algorithm.
4. **The `status` key collides with OKF v0.2** — *(externally verified in this audit)* the live
   OKF spec is now **v0.2** (SPEC cites v0.1) and **reserves frontmatter `status` with the
   fixed vocabulary `draft | stable | deprecated`** (absent ⇒ `stable`). iBuildOS writes
   `status: building/queued/accepted/…` — so KB-002's own conformance bar ("a stock OKF
   consumer can read the bundle") forces a decision: rename the workflow field (e.g., `state`),
   or accept off-vocabulary values. Silver lining: OKF v0.2's new `generated`/`verified`/
   `sources` provenance fields map cleanly onto RQ-013's provenance requirement.
5. **Contract manifest schema** (TP-004/009) — filename, command shape, preview-URL
   placeholders, ordered-resource grammar, component path scopes: everything depends on it
   (templates, trust fingerprinting TP-008, migration serialization IG-011), none of it exists.

The remaining thirteen: gate file format + the **canonical rule-ID registry** (profiles and
baselines reference rules by ID — renaming later breaks every baseline in the wild) · baseline
file + fingerprint algorithm (VG-008) · the component-emission convention GU-012 calls
"published" (it is published nowhere; even the carrier — tool-call vs extension payload — is an
unresolved "or") · GU component schemas · project config filename + schema (holds VG-012 pins,
dial default, sync policy, secret policy, MCP configs, role assignments) · Run/TestResult/
Review/Deploy/Change/claim record shapes + transcript-reference URI + JSONL shape · CLI
commands, flags, exit-code table, findings JSON schema — plus *(verified)* **npm `ibuild` is
already taken** (stale since 2020), so the bin name needs a human ruling · GitHub Action
inputs/outputs · template manifest + provenance keys · skill/command/bundle formats (EX) ·
commit-trailer keys + branch naming (GH-004, permanent git history) · the IPC contract (the
one format that is genuinely safe to invent — internal only).

### WORLD — the absolute walls (9 items)

No document fixes these; they are human-provisioned or they don't exist: **Apple Developer
account + Developer ID cert + notarization** (unsigned dmg = Gatekeeper wall = fatal for the
no-terminal persona) · **Windows signing certificate** · **GitHub org + Releases + Actions
billing** for the mandated macOS/Windows/Linux runners · **npm account + `@ibuildos` scope**
(scope verified free) · **tier-1 agent subscriptions** (Anthropic, OpenAI, pi) — note the
ordering trap: spikes are mandated *before* foundations, and S-1's live legs need these
accounts, a WORLD wall at step zero unless live legs are explicitly deferred behind the stub ·
**deploy-provider accounts** (Vercel/Fly/Netlify — narrative 7.1's final beat needs them) ·
**live-matrix CI account + spend authority** · **the release step the docs define as manual**
(T-013: pre-release smoke "on a maintainer machine" — an agent cannot execute a step specified
as human) · **forge/webhook test fixtures** (real repo with admin + PAT for GH-005/007).

### ACCEPTANCE — the silent risk

Measured: **8 of 252** requirements carry "Done when" (PS-001, PS-006, RQ-001, ST-005, BD-002,
KB-005, VG-010, TP-003). The four §7 narratives cite 59 unique IDs step-by-step — a genuine
executable oracle — bringing total coverage to ~25%. The other ~188 requirements have no
stated oracle; areas **PL, TX, EX, DA** have none at all. Some clauses are unverifiable as
written (PS-010's "every screen, entity, and action" with no enumeration; PS-006's gate
instrument is "a maintained glossary" that doesn't exist — the agent would have to author the
instrument its own gate is judged by). Spike thresholds are partially subjective (S-4's
acceptable-RSS bar, S-2's tie-breaker if both shapes pass, S-5's unshipped corpus).

### DESIGN — authorized invention needed

~35 implied screens counted from requirements; zero wireframes, no navigation map beyond "two
modes, deep links," design direction is one phrase, all product copy uninvented (including the
in-app manual and PS-006's glossary), and packaging cannot ship without an app icon. This class
doesn't need documents so much as a **decree**: either a lightweight design pack, or explicit
written authority that agent-invented UX is accepted for v1 subject to post-hoc review.

### DECISION — five named forks with no default

The shipped autonomy-dial default is never stated · the five "per policy" clauses (sync,
migrate/seed re-run, VG-012 warn-vs-refuse, DR-004 readiness threshold, RV-001 review surface)
name no shipped default · CH-001's significance rules (which edits demand ceremony) are
undefined · S-2's architectural fork has a procedure but no tie-breaker criteria · and the
**open-source license has no SPDX identifier** — D-114 says open-core; nothing says MIT vs
Apache-2.0 vs BSL for which packages. License choice is quasi-irreversible once external
contributions land and is outside any agent's authority.

### SCALE — the missing sequencing act

SPEC §0 explicitly reserves sequencing for "the separate execution plan" — which doesn't exist.
No bootstrap ladder resolves the circularities (profile format → engine → UI generation;
catalog → emission convention → bridge; NFR-015's dogfooding needs the tool before the tool
exists). Ironically, given PL-006 ("priority is data"), none of the 252 requirements carries a
priority.

---

## 3. What's already agent-ready (credit where due)

- **The §7 narratives are an executable E2E oracle** — 59 requirement IDs bracket-cited step by
  step, and T-013 explicitly binds Playwright E2E to them with the stub agent. A test-script
  blueprint, not prose.
- **The stub-agent strategy** decouples ~80% of the build from every WORLD item — the single
  decision that makes autonomous building of the core possible at all.
- **Spikes S-1..S-5** are concrete entry checks naming exact failure modes (429
  stall-and-resume, adapter-bump resume, per-preview attribution, token-splice edit cases).
- **Internal consistency is unusually high** — the adversarial review (G-01..G-42) already
  resolved the contradictions an agent would otherwise hit mid-build; decisions D-101..D-115
  and T-001..T-014 close forks with rationale and rejected alternatives.
- **The monorepo layout and engine decomposition** give real package boundaries; quantified
  NFRs (<100 ms, thousands-in-seconds) are directly testable; the trust model is honest
  (enforced vs directed), preventing an agent from over-building an impossible sandbox.
- **A blanket invention license already exists for tech minutiae** — TECH-STACK's "anything not
  decided here defaults to the most conventional choice at build time." It just doesn't cover
  product-behavior formats, which is exactly where the FORMAT class lives.
- **The external universe checks out** *(live-verified)*: the OKF spec exists and is
  self-contained, agentclientprotocol.com matches the SPEC's method list, and all six named npm
  dependencies resolve.

## 4. The Build-Ready Kit — what flips the verdict to YES

Six items. Four are documents I can produce; one is a decree you sign; one is half a day of
your time plus a budget. With items 1–3 plus the two decrees, an agent builds autonomously to
a **signed-release candidate**; item 6 is what stands between that and *shipped*.

| # | Artifact | Converts | Producer | Contents |
|---|---|---|---|---|
| 1 | **FORMATS.md** — normative serialization annex | All 18 FORMAT stalls | Claude, ~1 session | The profile dialect with a complete worked `Story` TypeDefinition · per-type frontmatter key tables + link/criterion-ID syntax · ID + provisional-ID grammar + finalization rule · file naming + bundle dir + **the OKF v0.2 decision** (rename workflow field vs off-vocabulary; adopt v0.2 `generated`/`sources` for RQ-013) · contract manifest schema + one filled example per template · the canonical rule-ID registry + gate file format · baseline format + exact fingerprint algorithm · flow-record key tables + transcript JSONL · component-emission convention v1 with a worked decision-card round-trip · CLI exit codes + findings JSON + Action interface + **bin-name ruling** (`ibuild` is taken on npm) · commit trailers + branch pattern · template manifest + project config schema |
| 2 | **EXECUTION-PLAN.md** — the document the spec already promises | SCALE (both), half of ACCEPTANCE | Claude, ~1 session | Ordered milestones with per-milestone acceptance ("first usable" = narrative 7.1 green on stub) · the bootstrap ladder resolving the circularities · spike gating per package · explicit delegation of in-flight sequencing to the builder · permission to defer live-adapter spike legs behind stub legs until credentials arrive |
| 3 | **DEFAULTS.md** — one-page policy sheet | All 5 DECISION defaults | Claude, minutes; you approve | Shipped dial default (proposal: `cruise`) · sync/migrate-seed/warn-vs-refuse/readiness/review-surface defaults · CH-001's exact significance field list · pre-spike stream-cap placeholder · S-2 tie-breaker criteria · S-4 RSS threshold |
| 4 | **Acceptance annex** | ACCEPTANCE (~188 reqs) | Claude, ~1 session — or decree | Extend the spec's own "Done when" device to every requirement (one line each) — or a signed decree that agent-authored acceptance criteria, reviewed post-hoc, are acceptable. Includes the PS-006 glossary (it's a gate instrument) and the S-5 YAML corpus |
| 5 | **Design decree (or mini design pack)** | All 4 DESIGN stalls | You (one paragraph) — optionally Claude drafts the pack | Cheapest: written authority that agent-invented UX is accepted for v1 subject to post-hoc review, with tokens decreed in one line ("shadcn defaults, light+dark, Linear density") + an app icon commissioned. Fuller: screen inventory + nav map + 10–15 key wireframes |
| 6 | **Provisioning pack** | All 9 WORLD stalls | **You** — ~half a day + budget | Apple Developer + Developer ID cert + notarization · Windows signing cert · GitHub org + Actions billing (mac/Win runners) · npm account + `@ibuildos` scope · agent accounts (Anthropic, OpenAI, pi) as CI secrets with spend cap · Vercel/Fly/Netlify tokens · **SPDX license choice** for the open-core packages (D-114 names the model, not the license) · a ruling on the manual pre-release smoke step (keep as human, or authorize recorded-session substitution) |

## 5. Spec corrections this audit itself surfaced (to fold into v1.2 alongside the kit)

- **Appendix C / KB-002**: OKF citation updates v0.1 → v0.2; the `status`-key resolution and
  the `generated`/`sources` provenance mapping become explicit requirements (FORMATS.md holds
  the bytes; the spec holds the decision).
- **T-009**: record the npm bin-name ruling (`ibuild` collision).
- **§12**: new decisions from the kit (license SPDX, OKF field resolution, dial default)
  append as D-116+.

## 6. Bottom line

The documents are an excellent *product* specification — arguably over-specified compared to
what most teams build from — but "build this with zero questions" is a different bar: it
demands the **bytes** (formats), the **order** (execution plan), the **oracles** (acceptance),
the **authority** (decrees), and the **keys** (provisioning). Items 1–5 are one focused
documentation push. Item 6 is irreducibly yours. After that, the honest answer to your
question becomes: **yes — to a signed release candidate, hands-off; and to shipped, with your
half-day of provisioning done up front.**

---

*Sources (live-verified during this audit): OKF SPEC.md v0.2 (raw.githubusercontent.com,
GoogleCloudPlatform/knowledge-catalog) · registry.npmjs.org (`ibuild` taken 2020, `@ibuildos`
scope free; `@agentclientprotocol/sdk`, `claude-agent-acp`, `codex-acp`, `pi-acp`,
`@copilotkit/runtime`, `@ag-ui/core` all resolve) · agentclientprotocol.com.*
