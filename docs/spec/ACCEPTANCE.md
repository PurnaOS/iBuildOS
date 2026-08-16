---
type: AcceptanceAnnex
title: "iBuildOS — Acceptance Annex: Done-When for All 252 Requirements (Build-Ready Kit #4)"
description: >-
  One testable acceptance line per SPEC v1.2 requirement. The builder flips each row with an
  evidence link (test name, fixture, or narrative step) as it lands; a row without evidence is
  not done. Rows marked ⚙ are fully automatable; ⚑ need a human check once; ⛭ are
  provisioning-gated (live leg).
status: draft
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, acceptance, done-when, build-ready-kit]
---

# Acceptance Annex

**How to read:** "Done when" lines are the per-requirement oracle (BUILD-READINESS stall 37).
Composite behaviors also covered by the §7 narrative E2E runs cite the narrative (N1–N4).
Evidence column is filled by the builder at land time.

## PS — Product Shell & Projects

| ID | Done when | |
|---|---|---|
| PS-001 | A machine with only git + one agent installed installs the app from the signed installer and creates a buildable project, no terminal | ⚑⛭ |
| PS-002 | Home lists ≥2 projects with live stream/approval/gate badges that update without refresh (Playwright) | ⚙ |
| PS-003 | Every route renders in both modes; mode switch preserves the current entity | ⚙ |
| PS-004 | Wizard: name→template→agent→scaffold ends with gates green + preview serving, zero manual file/git ops (N1) | ⚙ |
| PS-005 | Opening a non-iBuildOS git repo routes into BF-001 adoption | ⚙ |
| PS-006 | Vocabulary lint (DESIGN-CHARTER glossary) passes over all Product-mode strings in CI | ⚙ |
| PS-007 | Every summarized entity deep-links to its Engineering view and back (link audit test over route table) | ⚙ |
| PS-008 | With 3 streams + 2 previews live, activity surface reflects a state change within 1 s (test hook) | ⚙ |
| PS-009 | Each attention-queue event type (approval, acceptance, question, red gate, review request, supersession) lands in the queue + OS notification in a scripted run | ⚙ |
| PS-010 | Palette reaches every route in the route manifest + any artifact by ID/title; manifest completeness asserted in CI | ⚙ |
| PS-011 | First-run guided path completes against the stub agent; in-app manual covers every route (coverage check) | ⚙ |
| PS-012 | A setting set at app/project/run level resolves in documented precedence (unit matrix); project config is `ibuildos.yaml`, secrets provably absent from repo | ⚙ |
| PS-013 | With network disabled: browse/edit/validate/gates/preview all pass; agent/sync/deploy affordances show offline state, no crash | ⚙ |
| PS-014 | Clone the project to a second path: identity (ULID) stable, re-establish checklist lists missing secrets/agents before any dependent op fails | ⚙ |
| PS-015 | Onboarding artifact regenerates on profile/contract change; staleness otherwise flagged (`guidance/stale`) | ⚙ |

## RQ — Requirements Studio

| ID | Done when | |
|---|---|---|
| RQ-001 | A UI-authored requirement is a FORMATS §4-conformant file readable on GitHub (fixture diff) | ⚙ |
| RQ-002 | Form fields/validation derive from the profile: adding a field to `requirement.md` profile shows in the form with no code change | ⚙ |
| RQ-003 | Pasted text/doc/image lands as draft material linked to the project, convertible to requirements | ⚙ |
| RQ-004 | Brief→requirement and requirement→requirement `traces_to` both validate; depth is profile-set | ⚙ |
| RQ-005 | Criteria carry `[AC-n]` IDs; `ST-…#AC-n` references resolve in validation | ⚙ |
| RQ-006 | Stub-scripted interview: question cards render, answers return as turns, requirements accumulate in the side panel and are editable mid-interview (N1) | ⚙ |
| RQ-007 | Editing a `building` requirement routes through CH (test asserts the Change hook fires per DEFAULTS #7) | ⚙ |
| RQ-008 | Derived states flip automatically in the multi-stream fixture (queued→`building`, all done→`built`, tests pass→`verified`); hand-edit flags `state/derived` | ⚙ |
| RQ-009 | Readiness gate blocks a criteria-less requirement with actionable finding; passes after fix | ⚙ |
| RQ-010 | An EARS-pattern profile rule rejects a non-conforming body (fixture pair) | ⚙ |
| RQ-011 | Attachment stored under `assets/<id>/`, rendered in view, survives file move | ⚙ |
| RQ-012 | Stub review run produces advisory findings linked to artifacts; nothing auto-edited (tree hash unchanged) | ⚙ |
| RQ-013 | All four provenance values reachable through real flows; `generated.by` carries agent identity string | ⚙ |
| RQ-014 | DesignDirection artifact present ⇒ injected into every implementer session (context assert in stub transcript); breakdown links stories `honors` | ⚙ |

## ST — Stories & Tasks

| ID | Done when | |
|---|---|---|
| ST-001 | Story fixture validates; missing `implements` fails `link/cardinality` | ⚙ |
| ST-002 | Task `code` globs validated against tree (`chain/task-no-code` fixture pair) | ⚙ |
| ST-003 | Stub breakdown proposes epics/stories/criteria/tasks/deps/tests as one plan-tree; per-item edit/reject; apply is transactional (all-or-nothing on induced failure) (N1) | ⚙ |
| ST-004 | The same breakdown built entirely by hand through forms reaches an identical validation state (parity fixture) | ⚙ |
| ST-005 | Cycle in `depends_on` fails validation; scheduler never starts a stream with an unmerged dep (torture test) | ⚙ |
| ST-006 | `story-ready` gate enforces criteria/size/traceability/dep-consistency per FORMATS gates.yaml | ⚙ |
| ST-007 | Every default transition incl. reject/retire/re-verify paths exercised in the lifecycle test; illegal jump fails `state/legal` | ⚙ |
| ST-008 | Re-breakdown against changed requirements yields add/modify/retire diff (not a fresh list) — fixture asserts stable IDs on unchanged stories | ⚙ |
| ST-009 | Bug fixture: fix stream cannot pass `merge` without a `verifies`-Bug TestCase (`chain/bug-regression`) | ⚙ |

## TD — Test Design

| ID | Done when | |
|---|---|---|
| TD-001 | Manual + automated TestCase fixtures validate; `verifies` targets incl. criterion + Bug forms | ⚙ |
| TD-002 | Breakdown output includes per-story test cases derived from criteria (stub scenario asserts mapping) | ⚙ |
| TD-003 | Automated binding `{file, pattern}` validated against tree; result attach updates the case | ⚙ |
| TD-004 | Manual case runs as guided checklist producing a TR record with per-step outcomes | ⚙ |
| TD-005 | Stream changing code without accompanying test files fails `stream-done` (policy fixture); policy text reaches the agent (transcript assert) | ⚙ |
| TD-006 | Coverage view = criteria with passing verifying tests / total, computed from graph (known-fixture number) | ⚙ |
| TD-007 | Stub test-author run proposes edge-case tests as reviewable additions | ⚙ |
| TD-008 | CH impact set includes affected TestCases; re-plan contains their revision (N2) | ⚙ |
| TD-009 | Suite artifact groups cases; release-linked suite feeds DR-002 readiness | ⚙ |

## PL — Planning & Sequencing

| ID | Done when | |
|---|---|---|
| PL-001 | Backlog reorder + board drag persist as artifact field edits passing `state/legal` | ⚙ |
| PL-002 | Release + milestone group stories via `planned_for`; readiness computes per DR-002 | ⚙ |
| PL-003 | Sprints toggled off ⇒ zero sprint UI anywhere (route+string audit) | ⚙ |
| PL-004 | Dependency view shows the parallelization frontier matching scheduler state in the torture fixture | ⚙ |
| PL-005 | Estimates roll up story→epic→requirement→release correctly (arithmetic fixture) | ⚙ |
| PL-006 | Priority is a profile field; re-ordering priority requires no code change | ⚙ |
| PL-007 | Plan gate blocks: untraced story, missing criteria, missing tests, dep break — one fixture each | ⚙ |

## BD — Build Orchestration

| ID | Done when | |
|---|---|---|
| BD-001 | Stream = worktree+branch+session+assignment; all four visible and correlated in Engineering view | ⚙ |
| BD-002 | Two independent stories build simultaneously with isolated file effects (SPEC's own Done-when; torture test) | ⚙ |
| BD-003 | ACP fs/terminal calls outside the worktree are refused (negative tests); trunk checkout never used by a session | ⚙ |
| BD-004 | Dial matrix test: step/cruise/auto × {green gate, red gate, question, acceptance, merge} behaves exactly per D-115 table | ⚙ |
| BD-005 | Stage gates evaluate per FORMATS gates.yaml; stream-done requires validation+tests+policy+artifact updates (fixture) | ⚙ |
| BD-006 | Per-task commits present with trailers; task granularity visible in stream timeline | ⚙ |
| BD-007 | Scheduler defers dependent story until dep merges; predicted collision (shared `code` paths) not co-scheduled | ⚙ |
| BD-008 | Mid-run instruction reaches the session as next turn (stub transcript assert) without restart | ⚙ |
| BD-009 | Pause→resume preserves worktree + context; abort offers keep/discard and honors choice | ⚙ |
| BD-010 | Product view shows story/stage/tests/action summary; Engineering adds full transcript/tools/diffs — both live (N1) | ⚙ |
| BD-011 | Every session (incl. interview, breakdown, resolve) leaves a RN record per FORMATS §9 | ⚙ |
| BD-012 | Agent question pauses stream, renders decision card, answer resumes and is recorded on RN (N1) | ⚙ |
| BD-013 | Red gate / agent death / human reject each stop inspectably with all four remediation paths offered | ⚙ |
| BD-014 | kill −9 during a stream: relaunch recovers to last committed task; session re-established with context (torture test) | ⚙ |
| BD-015 | Cap + timeouts enforced; usage shown when adapter reports it; S-4-derived defaults in place | ⚙ |
| BD-016 | Stub 429 scenario: streams pause, backoff per DEFAULTS #9, one aggregate notice, auto-resume; no red until budget exceeded | ⚙ |
| BD-017 | Two-machine fixture (two clones): duplicate pickup prevented by claim; superseded stream pauses with notice; merge gate rejects already-done story | ⚙ |

## IG — Integration, Merge & Conflicts

| ID | Done when | |
|---|---|---|
| IG-001 | No path in the app lands work on trunk without the merge gate green (route/API audit + negative test) | ⚙ |
| IG-002 | Queue re-evaluates each landing against current trunk: fixture where stream went green against old trunk but red against new is blocked | ⚙ |
| IG-003 | Green+conflict-free landing merges per dial with atomic artifact updates (one commit, IG-009) | ⚙ |
| IG-004 | Conflicting merge spawns resolver session in integration worktree; resolution presented as reviewable change with re-run gates; approval lands it (stub-scripted conflict) | ⚙ |
| IG-005 | PR mode on: stream publishes branch + PR, local gates still evaluated; off: local queue only (forge fixture) | ⚙⛭ |
| IG-006 | Manual takeover opens the worktree; merge gate applies identically after | ⚙ |
| IG-007 | Post-landing, in-flight streams rebase clean automatically; conflicted rebase routes to IG-004 flow; both notified | ⚙ |
| IG-008 | A long stream lands at task granularity when gates allow (incremental landing fixture) | ⚙ |
| IG-009 | Landing commit contains code + artifact updates + run record together (commit content assert) | ⚙ |
| IG-010 | Out-of-app red push to trunk ⇒ trunk-broken state: queue holds, rebases pause, remediation offered, recovery recorded | ⚙ |
| IG-011 | Two migration streams: second serializes behind first; merge re-runs migrate+test clean (template fixture) | ⚙ |

## AC — ACP Agent Integration

| ID | Done when | |
|---|---|---|
| AC-001 | Dependency audit proves no LLM API called anywhere in the agent path; all AI flows traverse ACP sessions | ⚙ |
| AC-002 | Registry lists tier-1 defs; adding a custom agent via config connects without app update (stub registered as custom) | ⚙ |
| AC-003 | Capability differences change UI affordances (fixture agent without `loadSession` hides resume; nothing breaks) | ⚙ |
| AC-004 | Session lifecycle test: new/load/prompt/update-stream/cancel against stub; updates render live | ⚙ |
| AC-005 | App stores no model credentials (storage audit); auth errors surface as agent-health, not app prompts | ⚙⛭ |
| AC-006 | Permission matrix test: in-worktree edit auto-approves; outside-workspace/network/destructive prompt; every grant on the RN record | ⚙ |
| AC-007 | fs/terminal service scope negative tests (path escape, symlink escape) all refused | ⚙ |
| AC-008 | Per-role agent map honored (stub A plans, stub B implements — asserted by session identity) | ⚙ |
| AC-009 | Project MCP config + bundled `ibuildos-ui` server reach the session (stub receives and calls `ui_emit_component`) | ⚙ |
| AC-010 | Session context contains assignment artifacts, linked reqs/criteria, contract, house rules, DesignDirection (transcript content assert) | ⚙ |
| AC-011 | Preflight detects missing/broken agent; mid-project agent swap preserves artifacts and restarts sessions | ⚙ |
| AC-012 | Transcript is machine-local + gitignored; RN carries summary + `ibos-transcript://` ref; known secret value injected in a scenario is absent from persisted transcript (redaction assert) | ⚙ |
| AC-013 | Stub requests a secret: keychain prompt (not chat), value never in transcript/RN/card, stream resumes with env injected per policy | ⚙ |

## GU — Chat & Generative UI

| ID | Done when | |
|---|---|---|
| GU-001 | Chat opened on any entity carries that context (transcript assert of context block) | ⚙ |
| GU-002 | Convention-emitting stub renders components; non-emitting stub renders clean prose — same scenario both ways | ⚙ |
| GU-003 | Question-form kinds (choice/multi/text/rank) round-trip answers as structured turns | ⚙ |
| GU-004 | Plan/change-set card: per-item accept/edit/reject; apply transactional; simulation delta shown (VG-011) | ⚙ |
| GU-005 | Decision card shows options+consequences+recommendation; answer recorded on RN; credential ask routes to AC-013 not a card (negative test) | ⚙ |
| GU-006 | Progress component reflects ACP plan/tool updates live (stub scenario with staged plan) | ⚙ |
| GU-007 | Review summary lists criteria-with-evidence, decisions, limits; deep-links to diff | ⚙ |
| GU-008 | Every component entity reference deep-links (link audit over catalog fixtures) | ⚙ |
| GU-009 | Unknown component kind renders generic fallback without error (forward-compat fixture) | ⚙ |
| GU-010 | Bridge event vocabulary documented against AG-UI mapping table (T-004); native-renderer fallback demonstrated in S-2 record | ⚑ |
| GU-011 | Dictated audio (transcribed) and pasted doc/image enter as RQ-003 draft material | ⚑ |
| GU-012 | Both carriers (MCP tool + fenced block) proven in S-2; convention published in FORMATS §10 and taught via role instructions (transcript assert) | ⚙ |

## KB — Knowledge Base & Type Profiles

| ID | Done when | |
|---|---|---|
| KB-001 | Fresh clone + app + agent = fully operable project (no external store); storage audit shows repo-only persistence for shared state | ⚙ |
| KB-002 | Bundle passes an independent OKF v0.2 reader (fixture script) without translation | ⚙ |
| KB-003 | Adding a new artifact type purely as profile data makes it creatable/validatable/visible with zero code change | ⚙ |
| KB-004 | `extends`/abstract/json_schema behaviors each covered by a profile fixture | ⚙ |
| KB-005 | Renaming a state or adding a field appears in forms/board/colors with no app update (SPEC Done-when) | ⚙ |
| KB-006 | Meta-validation errors (unknown extends/target/state/gate) name file+key (fixture pack) | ⚙ |
| KB-007 | One-field CST edit yields a one-line diff on the gnarly corpus; structural edits byte-stable elsewhere (S-5) | ⚙ |
| KB-008 | Delete `.ibuildos/`+app: repo remains readable markdown; unknown types/fields warn, never reject | ⚙ |
| KB-009 | Profile export/import between two projects preserves behavior (round-trip fixture) | ⚙ |
| KB-010 | Provisional-ID lifecycle per FORMATS §2 incl. collision renumber + link rewrite (torture test) | ⚙ |
| KB-011 | Profile version bump offers a reviewable migration change-set; artifacts never silently re-interpreted (pin honored) | ⚙ |

## VG — Validation & Gates

| ID | Done when | |
|---|---|---|
| VG-001 | Rule registry implemented per FORMATS §6; each rule has pass+fail fixtures | ⚙ |
| VG-002 | Edit-to-findings < 50 ms p95 on 5k-artifact repo; full validate seconds (bench in CI) | ⚙ |
| VG-003 | Every finding carries rule/severity/artifact/subject/message(+fix); severities overridable per project | ⚙ |
| VG-004 | gates.yaml edits change gate composition with no code change | ⚙ |
| VG-005 | No advancement path bypasses gate results (API audit); red never auto-advances in any dial (matrix test) | ⚙ |
| VG-006 | Plan-gate fixtures incl. `ready`-or-later requirement acceptance | ⚙ |
| VG-007 | `chain/done-honest` fixture: done without merged code/passing tests/intact chain fails | ⚙ |
| VG-008 | Baseline blocks only new violations; ratchet enforced; scope-expansion event adds entries with distinct reporting | ⚙ |
| VG-009 | Docs rules + project lint orchestration fold into one findings report (template fixture) | ⚙ |
| VG-010 | Same commit: app and CLI produce byte-identical findings JSON (CI parity job); annotate-only mode exits 0 | ⚙ |
| VG-011 | Proposal simulation shows exact findings delta before apply (fixture arithmetic) | ⚙ |
| VG-012 | Pin mismatch: UI warns + blocks auto-advance; CLI exits 3; results record engine version | ⚙ |
| VG-013 | Gate verdict = checks + recorded evidence; stale evidence flags `evid/stale`; reproducibility asserted from stored evidence | ⚙ |

## TR — Traceability & Impact

| ID | Done when | |
|---|---|---|
| TR-001 | Chain fixture validates end-to-end; every §11 relationship traversed by a test | ⚙ |
| TR-002 | Orphan fixtures (4 kinds) produce their findings at configured severities | ⚙ |
| TR-003 | Every artifact view shows both link directions (view test over fixture graph) | ⚙ |
| TR-004 | Matrix + chain view render the fixture correctly; JSON export schema-stable | ⚙ |
| TR-005 | Impact query returns exact expected set on the fixture (requirement edit / file set / artifact) | ⚙ |
| TR-006 | Release-scoped query answers "fully built+verified?" correctly for green and red fixtures | ⚙ |
| TR-007 | Code-file back-reference resolves file→tasks→stories→requirements in Engineering view | ⚙ |

## CH — Live Change Management

| ID | Done when | |
|---|---|---|
| CH-001 | DEFAULTS #7 matrix: each significant field triggers a Change; each insignificant one doesn't | ⚙ |
| CH-002 | Change artifact records before/after/why linked to affected artifacts (N2) | ⚙ |
| CH-003 | Impact presented before any downstream write (order asserted in E2E) covering built/queued/in-flight/tests/releases | ⚙ |
| CH-004 | Re-plan applies as one transactional change-set incl. story retire + test revisions (N2) | ⚙ |
| CH-005 | Affected accepted/done stories return to review with re-verification work queued | ⚙ |
| CH-006 | Requirement view shows its change history derived from Changes + git | ⚙ |
| CH-007 | In-flight stream on changed artifact: pauses or receives revision-with-acknowledgment per dial (both paths tested) (N2) | ⚙ |
| CH-008 | Deterministic drift fixtures (retired-ref code, superseded-criteria tests, moved requirement) all flagged | ⚙ |
| CH-009 | Product-mode "Remove/rework" on a done story: impact → change-set → stream → merge; trunk stays green; external revert detected as drift with guided reconciliation | ⚙ |
| CH-010 | Stub conformance audit produces advisory findings linked story/requirement/code | ⚙ |

## PV — Preview & Environments

| ID | Done when | |
|---|---|---|
| PV-001 | Contract dev command launches managed per stream + trunk; ports allocated; logs captured; tree-killed clean on stop (Windows included) | ⚙ |
| PV-002 | One click from story/stream opens the running app built from that work (embedded for web) (N1) | ⚙ |
| PV-003 | Preview header states story/branch/commit + data-state; stale source visibly flagged | ⚙ |
| PV-004 | Trunk preview reflects a just-landed merge (auto migrate/seed per DEFAULTS #3) | ⚙ |
| PV-005 | Environment defs in repo (names/defaults only); secret values keychain-only; committed-secret rule catches a planted secret at stream-done and merge | ⚙ |
| PV-006 | Template seed command produces the documented dataset; preview reflects it | ⚙ |
| PV-007 | Thrown page error + failed fetch captured with correct per-preview attribution (two concurrent previews) and attach to bug/session in one click (S-3) | ⚙ |
| PV-008 | API template: HTTP console derived from routes lets a PM exercise an endpoint; CLI target: runner pane; no-surface fallback presents evidence package in acceptance | ⚙ |
| PV-009 | Trunk advance re-runs migrate/seed per policy; data-state provenance shown (fixture asserts migration list) | ⚙ |

## TX — Test Execution & Quality

| ID | Done when | |
|---|---|---|
| TX-001 | UI runs: per-stream, per-story (bound only), full-suite trunk — via contract command (asserted argv) | ⚙ |
| TX-002 | Stage transitions auto-run bound tests; results feed gates without user action | ⚙ |
| TX-003 | Single failed test re-runnable; watch loop per stream in Engineering mode | ⚙ |
| TX-004 | Every run writes a TR artifact per FORMATS §9 (what/commit/verdict/evidence) | ⚙ |
| TX-005 | Guided manual run captures per-step outcome + evidence into TR | ⚙ |
| TX-006 | Coverage, gates, and insights all read from the same TR records (single-source assert) | ⚙ |
| TX-007 | Flaky fixture (alternating pass/fail) gets flagged after N runs per policy | ⚙ |
| TX-008 | Suite executes as one tracked run; aggregate TR feeds DR-002 readiness | ⚙ |

## RV — Review & Acceptance

| ID | Done when | |
|---|---|---|
| RV-001 | Product acceptance alone satisfies merge approval by default; profile flag requiring engineering review enforces it (both fixtures) | ⚙ |
| RV-002 | Acceptance queue item contains everything RV-003 lists without navigation | ⚙ |
| RV-003 | Acceptance screen: criteria checklist w/ evidence, summary, preview (or PV-008 surface), decisions/limits; accept/changes/reject each fully wired (N1) | ⚙ |
| RV-004 | Each criterion links to passing test, manual TR, or recorded waiver; unwaived-unverified criterion blocks accept | ⚙ |
| RV-005 | Engineering review: diffs, commits, findings delta, transcript; comments persist as CM artifacts | ⚙ |
| RV-006 | Assigned review lands in assignee's queue on their machine after sync (two-clone fixture) | ⚙ |
| RV-007 | Every approval/acceptance/waiver — incl. dial-waived — recorded per FORMATS §9 with actor+commit (audit query fixture) | ⚙ |

## GH — Git & Remote Integration

| ID | Done when | |
|---|---|---|
| GH-001 | Storage audit: all history/branch/sync state is plain git; no side metadata store | ⚙ |
| GH-002 | N1 completes with zero user-visible git vocabulary in Product mode (PS-006 lint covers it) | ⚙ |
| GH-003 | Bare-remote fixture: auto fetch/push per DEFAULTS #2; conflict surfaces per TM-006 | ⚙ |
| GH-004 | Agent-authored commit carries FORMATS §11 trailers; `git log` answers who/what/run (trailer parse test) | ⚙ |
| GH-005 | With forge fixture: stream→PR mapping + CI status into gates; pure-git remote degrades clean | ⚙⛭ |
| GH-006 | Artifact history view renders humanized git history in Product mode, raw in Engineering | ⚙ |
| GH-007 | One-click branch-protection setup on a test repo; drift (protection disabled) reported as finding | ⛭ |

## TP — App Templates & Project Contract

| ID | Done when | |
|---|---|---|
| TP-001 | Three shipped templates listed from data; user template from git URL registers and scaffolds | ⚙ |
| TP-002 | Each template contains scaffold/contract/profile/seed/tests/deploy-def (manifest audit) | ⚙ |
| TP-003 | Create-from-template → gates green, tests pass, preview serves, zero manual fixes — in template CI on every template change (SPEC Done-when) | ⚙ |
| TP-004 | Contract fixture exercises every key incl. migrate/ordered/safe/components; engine consumes argv-only | ⚙ |
| TP-005 | Broken command reported as `contract/valid` finding at open (post-trust), not runtime crash | ⚙ |
| TP-006 | Stub derivation on a contract-less repo proposes a working contract, human-confirmed | ⚙ |
| TP-007 | Template update arrives as reviewable change-set; provenance recorded in ibuildos.yaml | ⚙ |
| TP-008 | Untrusted repo: zero contract execution before confirmation (process audit); contract-hash change re-prompts; stream modifying scripts requires approval before its commands run | ⚙ |
| TP-009 | Two-component monorepo fixture: per-component commands/paths/preview; story binds to component; composed preview (api+web) works | ⚙ |

## DR — Delivery & Releases

| ID | Done when | |
|---|---|---|
| DR-001 | Release artifact groups stories; view lists deploys + notes | ⚙ |
| DR-002 | Readiness = DEFAULTS #5 formula, computed live on fixtures (green + two red variants) | ⚙ |
| DR-003 | One-click deploy on a template project: env selection, secret injection, live output, DP record (live leg vs local stub target) | ⚙⛭ |
| DR-004 | Deploy blocked below readiness threshold with the gate's findings shown | ⚙ |
| DR-005 | Contract without deploy target: delivery tracked (release/readiness/notes), deploy affordance absent — never guessed | ⚙ |
| DR-006 | Notes drafted from actual release contents; audience toggle changes framing; human edit before any send | ⚙ |
| DR-007 | "What runs where" answerable from DP records; rollback command exposed with same gating (fixture) | ⚙ |
| DR-008 | Missing provider auth: guided connect (auth → keychain → dry-run) before execution; raw TTY prompt never reaches the user | ⚙⛭ |

## BF — Brownfield Adoption

| ID | Done when | |
|---|---|---|
| BF-001 | Adoption flow: contract → backfill → baseline → normal ops; each step skippable + resumable (state fixture) | ⚙ |
| BF-002 | Adoption adds files only (tree diff assert); restructure proposals require approval | ⚙ |
| BF-003 | Stub comprehension yields contract + system summary on the brownfield fixture repo | ⚙ |
| BF-004 | Backfill lands as reviewable batches with per-item confidence + `backfilled` provenance; batch reject leaves no trace | ⚙ |
| BF-005 | Scoped adoption: strict findings inside scope, silence outside; scope expansion works (VG-008 event) | ⚙ |
| BF-006 | Day-one baseline makes gate useful immediately (new violation blocks, old doesn't) (N3) | ⚙ |
| BF-007 | External refs render as links; no import machinery invoked | ⚙ |
| BF-008 | Post-adoption fixture passes the same N1-style loop as greenfield (N3) | ⚙ |
| BF-009 | Team adoption guide generated with baseline/gate/rollout content; regenerates on profile change | ⚙ |

## TM — Team & Identity

| ID | Done when | |
|---|---|---|
| TM-001 | User/Team artifacts resolve from git identity; ownership/assignment reference them | ⚙ |
| TM-002 | Full two-clone team fixture passes N4 with no server (network audit: git remote only) | ⚙ |
| TM-003 | Assignment on state transition per profile default lands correctly | ⚙ |
| TM-004 | My-queue aggregates assigned/reviews/questions/bugs for current identity (fixture identity swap changes queue) | ⚙ |
| TM-005 | Fetch diff produces exactly the notification set for the scripted remote change (N4) | ⚙ |
| TM-006 | Concurrent-edit awareness banner on fetch-visible in-flight change; soft-claim metadata optional, never blocking | ⚙ |
| TM-007 | Handoff transition puts item in recipient's queue explicitly (two-clone assert) | ⚙ |
| TM-008 | Webhook adapter fixture receives opted-in events; default all-off verified | ⚙ |
| TM-009 | Coordination types toggled on: creatable/linkable; off: invisible (route+string audit) | ⚙ |

## EX — Extensibility

| ID | Done when | |
|---|---|---|
| EX-001 | Custom ACP agent (the stub, registered as third-party) fully drives a build | ⚙ |
| EX-002 | Skill attached to a role appears in matching session context (transcript assert); versioned | ⚙ |
| EX-003 | Data-defined command (argv + playbook kinds) runs from palette with declared params | ⚙ |
| EX-004 | Workflow change (new state + transition + gate binding) via profile edit alone | ⚙ |
| EX-005 | Every injected instruction inspectable in a UI panel; per-project override honored (transcript assert) | ⚙ |
| EX-006 | House-rules artifact injected into all sessions + exported to AGENTS.md | ⚙ |
| EX-007 | All project config lives in repo files; config change lands via normal review flow | ⚙ |
| EX-008 | Export/import bundle (profile+skills+commands+template ref) reproduces behavior in a fresh project | ⚙ |
| EX-009 | Command scope enforcement: network-scoped command prompts per AC-006; read-only cannot write (negative tests) | ⚙ |
| EX-010 | AGENTS.md regenerates on house-rule/profile change or flags `guidance/stale` | ⚙ |

## IN — Insights & Reporting

| ID | Done when | |
|---|---|---|
| IN-001 | Progress dashboard numbers match hand-computed fixture values | ⚙ |
| IN-002 | Quality dashboard reads coverage/suite/flakes/findings from single sources (TX-006) | ⚙ |
| IN-003 | Trend charts recompute identically from git history alone (reproducibility run) | ⚙ |
| IN-004 | Digest drafted from repo activity; audience variants; nothing sends without approval | ⚙ |
| IN-005 | Activity feed shows the scripted event sequence in both vocabularies | ⚙ |
| IN-006 | Baseline burndown distinguishes shrink vs scope-expansion (VG-008 fixture) | ⚙ |
| IN-007 | Agent-ops view: runs/durations/outcomes/interventions (+usage where reported) from RN records | ⚙ |
| IN-008 | Per-assignee open-work view matches fixture assignments | ⚙ |

## DA — Decisions & Architecture

| ID | Done when | |
|---|---|---|
| DA-001 | Decision creatable directly and promoted 1-click from an answered decision card and a Change rationale, with `constrains`/`supersedes` links | ⚙ |
| DA-002 | Constrained artifact shows its decisions; decision in scope appears in session context (transcript assert) | ⚙ |
| DA-003 | Architecture artifact with text-based diagram renders in-app; linked to component + requirements; in session context | ⚙ |
| DA-004 | Runbook linked to deploy target surfaces beside deploy + trunk-broken flows | ⚙ |

## NFR

| ID | Done when | |
|---|---|---|
| NFR-001 | Egress audit under packet capture: only agent backend, git remote, deploys, opted-in channels; third-party telemetry provably disabled (G-39 assert) | ⚙ |
| NFR-002 | Fresh install works with zero accounts/services of ours (offline-first-run test) | ⚙ |
| NFR-003 | p95 interaction < 100 ms during S-4 load run (perf harness in E2E) | ⚙ |
| NFR-004 | Bench: 5k artifacts full-validate in seconds, edit-revalidate in tens of ms (CI bench with thresholds) | ⚙ |
| NFR-005 | Determinism suite: same commit+profile+engine ⇒ byte-identical findings across OSes and app/CLI | ⚙ |
| NFR-006 | Crash-recovery suite (kill −9 at 5 lifecycle points) recovers with no committed-work loss | ⚙ |
| NFR-007 | Security test set: scope escapes refused, TOFU enforced, secrets redacted, no repo-code execution during validation | ⚙ |
| NFR-008 | Audit query: for a fixture project, every consequential action answerable (who/what/when/commit) from repo alone | ⚙ |
| NFR-009 | Matrix: nothing reaches trunk/production through the app with red gates (negative suite); CH-009 delivers reversal | ⚙ |
| NFR-010 | Authoring a linked story+test via forms ≤ 8 interactions (UX budget test); AI path ≤ 3 | ⚑ |
| NFR-011 | Full keyboard pass over core flows; contrast + landmarks pass automated a11y audit on both themes; 3 OS installers | ⚙ |
| NFR-012 | 10k-artifact synthetic repo: app remains responsive (progressive loading), no hard cap hit | ⚙ |
| NFR-013 | Graph/matrix/findings/report exports parse against published schemas | ⚙ |
| NFR-014 | Profile/gates/templates/skills/commands/agents/components each extended by data-only fixture without forking | ⚙ |
| NFR-015 | The iBuildOS repo validates green with its own gates from M1 onward (CI on our own repo) | ⚙ |
| NFR-016 | Open-core packages carry Apache-2.0 LICENSE + headers; formats/schemas published; desktop licensing stated | ⚑⛭ |

---

**Counts:** 252 rows · ⚙ automatable 246 · ⚑ human-check-once 5 · ⛭ provisioning-gated legs 8
(overlapping). A row flips only with an evidence link.
