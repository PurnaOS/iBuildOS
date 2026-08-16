---
type: ReviewReport
title: "iBuildOS — Gap Review of SPEC.md v1.0 and TECH-STACK.md v1.0"
description: >-
  Adversarial review of the specification and tech-stack documents: four independent lenses
  (internal consistency, scenario stress-testing, v0.5 regression audit, technical feasibility
  with web verification), findings verified against the documents before inclusion.
status: draft
version: 1.0.0
date: 2026-08-13
owner: srini
tags: [ibuildos, review, gaps, spec, tech-stack]
---

# Gap Review — SPEC v1.0 + TECH-STACK v1.0

**Method.** Four independent review passes — (1) internal consistency & completeness, (2)
adversarial scenario walking (16 scenarios), (3) regression audit against v0.5's 144
requirements and both journey gap-analyses, (4) technical feasibility with web verification of
package/protocol claims — followed by verification of every quoted claim against the documents.
Findings that turned out to be covered were discarded; everything below is confirmed.

**Verdict.** The architecture holds — no finding invalidates a §12 decision or a stack choice.
But the review surfaced **41 verified gaps: 10 high, 22 medium, 9 low**. The high-severity ones
cluster in five places: the merge queue must *coordinate* parallel streams (not just check
them), the trust story has enforcement holes it must either close or state honestly, the
autonomy dial's exact semantics are contradictory at the one place that matters most, gate
reproducibility needs engine/profile version pinning to be true, and "undo" doesn't exist.
One tech claim was factually wrong (CopilotKit dependency tree) and several tech decisions
need hardening or reversal (electron-trpc). All fixes are amendments — nothing requires
re-architecting.

---

## Cluster 1 — Parallel coordination: the merge queue must coordinate, not just check

The root cause across three high findings: IG-002 re-evaluates *checks* at merge, but nothing
gives any component authority over **cross-stream semantics** — IDs, ordered resources,
duplicate assignments.

- **G-01 · HIGH — Artifact ID collision under concurrent allocation.** Streams create artifacts
  (run records BD-011, results TX-004, agent-authored tasks), and RQ-001/ST-001 demand stable
  unique IDs — but no requirement defines an allocation scheme safe under concurrency, and
  VG-001's checks don't include ID uniqueness. Two streams minting `ST-042` with different
  slugs merge green; every link to `ST-042` becomes ambiguous. *Fix:* new KB requirement —
  stream-scoped provisional IDs finalized by the merge queue (single allocator per trunk
  landing); duplicate-ID as a merge-gate error rule; queue renumbers + rewrites inbound links
  atomically (IG-009).
- **G-02 · HIGH — Ordered resources (DB migrations) in parallel streams.** TP-004's command
  vocabulary has no `migrate`; three streams create `0004_x/y/z` from the same base — no git
  conflict, broken runtime. Preview data-state on trunk advance (migrate/re-seed policy) is
  also unspecified (PV-003/004/006). *Fix:* contract gains an optional `migrate` command;
  merge gate re-runs migrate+test from clean state; plan marks schema-changing stories for
  serialized merging (BD-007/IG-002); PV freshness includes data-state provenance.
- **G-03 · HIGH — Duplicate stream pickup across machines.** BD-002's scheduler has no
  user/claim scoping; two machines start streams on the same queued story; nothing detects
  supersession ("story already merged elsewhere") or defines the losing stream's fate.
  *Fix:* scheduler auto-starts only work assigned to/claimed by the local user; starting a
  stream writes a claim to the story artifact (pushed per sync policy); on fetch, superseded
  streams pause with a notice; merge gate fails a stream whose story is already `done` on trunk.

## Cluster 2 — Trust & security: close the holes or state them honestly

- **G-04 · HIGH — TP-005 executes repo-declared commands on project open.** "Verify the
  contract (commands exist and run) on project open" + PS-005 "open any existing repo" =
  drive-by code execution from a hostile clone, contradicting NFR-007. *Fix:* trust-on-first-use
  — explicit "trust this project's contract" confirmation before first execution of any
  contract command (and re-confirmation when the contract changes).
- **G-05 · HIGH — Prompt injection → contract-command escalation.** Repo content can steer an
  agent; the agent edits `package.json` scripts in its worktree (auto-approved in-worktree
  edit, AC-006); the now-attacker-controlled "declared-safe" test command runs automatically
  at every stage gate (TX-002) with network and env access — outside the ACP permission model
  entirely. *Fix:* resolve contract commands from trunk (or diff-gate streams that modify
  contract/script files); least-privilege env for agent-triggered runs (secrets only for
  user-initiated preview/deploy); list OS-sandboxing of contract runs as a hardening item;
  add the risk row.
- **G-06 · HIGH — Worktree "isolation" is stated as a guarantee the mechanisms can't deliver.**
  AC-007 scopes ACP-served fs/terminal methods, but agents are OS processes with their own
  file access (TECH-STACK admits handlers "not trusted to the agent"); command classification
  (AC-006) is undecidable for free-form terminals. *Fix:* either add an NFR requiring OS-level
  sandboxing of agent/contract processes, or amend §8/NFR-007 to the honest claim: scoping is
  enforced for ACP-served methods and advisory (cwd + policy + audit) for agent-native access.
- **G-07 · HIGH — Transcripts & preview diagnostics are a secret-exfiltration path into git.**
  T-005 persists transcripts "beside run artifacts" (which are repo artifacts per KB-001,
  merged per IG-009, pushed per GH); dev-server logs receive injected secret env values;
  pattern-based secret rules won't catch arbitrary values in JSONL. This also collides with
  AC-012 ("persisted locally") — SPEC and TECH-STACK currently disagree. *Fix:* decide
  transcripts/diagnostics are machine-local (gitignored app dir), referenced — never committed;
  run records carry an in-repo summary sufficient for NFR-008; redaction pass scrubs known
  secret values from transcripts/attachments; add risk row.
- **G-08 · MEDIUM — Secret provisioning flow routes through the wrong channel.** An agent
  needing a credential (Stripe key) would ask via decision card, and GU-005 records answers on
  the run record → the secret lands in the repo. No "stream blocked on missing secret →
  keychain prompt → resume" flow exists; whether secrets inject into agent terminal sessions is
  unstated. *Fix:* a distinct secret-request event: values go keychain-only (PV-005), never
  through chat/cards; redacted everywhere; per-variable policy for agent-session injection.
- **G-09 · MEDIUM — safeStorage on Linux can silently be plaintext-equivalent; CLI can't read
  safeStorage at all.** On keyring-less Linux setups Electron falls back to `basic_text`;
  T-010 claims "OS keychain-backed" unconditionally. The npm CLI (no Electron) has no defined
  secrets source. *Fix:* detect backend at startup, refuse/warn on `basic_text`; document
  keyring prerequisites; CLI sources secrets from process env only — stated explicitly.
- **G-10 · MEDIUM — Rogue trunk push has no specified aftermath.** §13 correctly defers
  authorization, but: no requirement helps configure/verify branch protection + required
  checks (the enforcement the spec itself recommends), and a gate-red trunk (from an
  out-of-app push) deadlocks the merge queue with only a notification specified. *Fix:* GH
  requirement — one-click branch-protection setup/verification where the forge supports it,
  drift as a finding; IG requirement — defined trunk-broken state: queue holds, auto-rebase
  pauses, guided remediation (fix-forward stream or recorded one-time quarantine).

## Cluster 3 — Autonomy & lifecycle semantics

- **G-11 · HIGH — The `auto` dial's acceptance semantics are contradictory, and "decision
  points" is undefined.** §6 says cruise stops at "decision points and merges" (no acceptances);
  BD-004 says cruise stops at "decision points, acceptances, and merges"; `auto` literally adds
  only merges — so does `auto` waive acceptance or not? IG-001/IG-003 imply dial-dependent
  acceptance; ST-007 requires an `accepted` transition and RV-007 a recorded approval that a
  zero-touch run has no actor to produce. *Fix:* define the three levels exactly (auto waives
  the acceptance *stop*, recording acceptance as `dial-waived` on the run record, satisfying
  RV-007); enumerate "decision points" (agent questions BD-012, breakdown/change-set approvals
  ST-003/CH-004, secret requests G-08); align §6 with BD-004.
- **G-12 · HIGH — Gate reproducibility as stated is unfalsifiable.** NFR-005 ("same commit +
  same profile → same results") cannot hold for gates that include test execution (flaky by
  the spec's own TX-007), project linters, and optional live CI status (GH-005). *Fix:* split
  the claim — bit-reproducibility for the validation subset (VG-001); gates = deterministic
  checks + *recorded* execution results evaluated against a commit; reproducibility = same
  commit + profile + recorded results → same verdict; GH-005 noted as a network exception.
- **G-13 · MEDIUM — Story lifecycle has no reject/retire/backward transitions.** ST-007's
  default is strictly forward, but RV-003 mandates reject/request-changes, CH-004 retires
  stories, CH-005 requires re-acceptance — all illegal transitions under the shipped profile;
  stream disposition on human rejection is undefined (BD-013 covers only red gates/agent
  failure). *Fix:* extend the default lifecycle (`rejected`, `retired`, review→building,
  accepted/done→review) and define stream fate on reject via BD-013 semantics.
- **G-14 · MEDIUM — Requirement statuses `building/built/verified` have no assigned actor —
  and if ever set, the plan gate breaks.** Nothing writes them (BD-005/IG-003 update
  story/task only), yet VG-006/PL-007 require stories to trace to a *`ready`* requirement —
  so a requirement correctly marked `building` blocks all follow-on stories, including every
  CH-004 re-plan. *Fix:* requirement status derives automatically from its stories' states;
  plan gate accepts `ready`-or-later non-retired statuses.
- **G-15 · MEDIUM — Referenced gates/rules missing from the shipped defaults.** ST-006's
  story-readiness gate and PV-005's committed-secret rule appear in no §11 default gate.
  *Fix:* add `story-ready` to the default gate list; bind the committed-secret rule to
  `stream-done` and `merge`.
- **G-16 · LOW — IN-004's "user-configured channels" is an egress path missing from NFR-001's
  closed exception list.** *Fix:* add reporting channels (per explicit approval per send) to
  NFR-001's exceptions.

## Cluster 4 — Reproducibility across machines: version pinning (regression from v0.5)

- **G-17 · HIGH — Engine/profile version pinning was lost from v0.5 (D-008/VL-012).** Nothing
  pins the validation-engine version or the profile version in-repo; auto-updated app vs
  CI-pinned CLI vs teammate's older app evaluate the same commit differently — breaking
  VG-010's own done-when ("UI and CI cannot disagree") and corrupting baseline fingerprints.
  Appendix B claims VL carried wholesale; this clause didn't. *Fix:* new VG/KB requirement —
  repo records required engine version/range + profile version; app and CLI warn/refuse on
  mismatch; gate results and baselines record the producing engine version; the GitHub Action
  installs the repo-declared version; updater defers while streams/merges are active.
- **G-18 · MEDIUM — Profile upgrade/migration path lost (v0.5 GV-003).** KB-009 versions and
  shares profiles but nothing migrates existing artifacts when a profile changes; TP-007
  solves exactly this for templates, proving the pattern. *Fix:* KB-010 — profile version
  bumps ship a migration/compatibility statement; upgrades offered as reviewable change-sets;
  artifacts validated against the recorded profile version, never silently re-interpreted.
- **G-19 · MEDIUM — Baseline "only shrinks" contradicts expanding adoption scope (BF-005).**
  Expanding to a new directory must add its pre-existing debt to the baseline. *Fix:* VG-008 —
  baseline shrinks *within adopted scope*; scope expansion may add entries, recorded as a
  scope-expansion event so IN-006 burndown distinguishes new scope from regression.

## Cluster 5 — Undo

- **G-20 · HIGH — No revert workflow for accepted+merged work.** "Undo/revert" appears nowhere;
  NFR-009 promises reversibility no requirement delivers. The PM has no path; a terminal
  `git revert` leaves trunk red (VG-007/TR-002: `done` stories with dead `code` links) and
  violates IG-009's knowledge+code atomicity by construction. *Fix:* CH requirement — "remove/
  rework this story" as a first-class change workflow: impact → proposed change-set (revert or
  removal stories + artifact status rollback + test retirement) → normal stream + merge gate →
  recorded Change; out-of-app reverts detected as drift (CH-008) with guided reconciliation.

## Cluster 6 — Data model completeness (§11)

- **G-21 · MEDIUM — Review/Approval and Comment types don't exist, yet requirements depend on
  them.** RV-001's "review object", RV-005's "comment threads recorded as artifacts", RV-004's
  recorded waivers, TM-003's assignable reviews — no §11 type carries them; the relationship
  table even references "Review" as an `assignee` source. *Fix:* add `Review`/`Approval` and
  `Comment` to the Flow taxonomy.
- **G-22 · MEDIUM — `result_of` for Run is too narrow.** BD-011 requires run records for
  *every* agent execution — interviews, breakdowns, adoption passes, merge resolutions,
  digests — but `result_of` permits only Run → Story/Task. *Fix:* widen targets (Change,
  Merge, Requirement-set) or make the link optional with assignment recorded as a field.
- **G-23 · MEDIUM — Regression-test gate for bugs is unexpressible.** ST-009 requires a
  regression test before a fix merges, but `verifies` cannot target a Bug and no other
  relationship connects TestCase↔Bug. *Fix:* extend `verifies` targets to include Bug (or add
  `regression_test`: Bug → TestCase) and name the rule in the default merge gate.
- **G-24 · MEDIUM — ADRs are functionally orphaned; architecture & runbooks lost (v0.5 area
  AD).** `Decision (ADR)` exists in the taxonomy but no requirement creates, links, or
  surfaces one — answered decision cards (GU-005) and change rationales (CH-002) have no
  promotion path to Decisions; architecture-as-code and runbooks vanished entirely, and
  Appendix B never accounts for area AD. *Fix:* small "Decisions & Architecture" additions —
  capture/promote Decisions with `constrains`/`supersedes` links surfaced on constrained
  artifacts; an Architecture artifact type (text-based diagrams) fed to agents via AC-010;
  Runbook artifacts linked to deploy targets (DR).
- **G-25 · MEDIUM — Test plans/suites lost (v0.5 TT-007).** No way to group test cases into a
  named suite (release regression, smoke) or track a suite execution; no TestCase→Release
  link exists, so a release test pass isn't expressible. *Fix:* TD-009 — suites as artifacts
  linkable to releases/milestones; TX runs/guides a suite as one tracked execution feeding
  DR-002.
- **G-26 · LOW — `planned_for` omits Milestone; `traces_to` locks hierarchy at depth 2.**
  PL-002/PL-005/TR-006 mandate milestone grouping the default profile can't express; RQ-004's
  "profile-configurable depth" needs Requirement→Requirement. *Fix:* widen both rows.
- **G-27 · LOW — Persona type lost (v0.5 RM-005/§9).** The interview (RQ-006) elicits "who are
  the users?" with nowhere structured to put it. *Fix:* add Persona to Knowledge types with a
  `serves` link (profile-optional).
- **G-28 · LOW — Team coordination artifacts and per-person workload views lost (v0.5
  WP-011/UI-016).** KB-001 promises team knowledge in-repo but ships no types for it; IN-007
  covers agent workload only. *Fix:* optional Coordination types (profile-toggled like
  sprints) + a derived per-assignee open-work view.

## Cluster 7 — Product-mode reality gaps

- **G-29 · MEDIUM — Non-web targets have no real preview or acceptance surface.** PV-002's
  answer for the day-one API-service template is "external launch" — meaningless to the PM
  persona; RV-003 centers a preview that doesn't exist; TD-004 manual steps presume the user
  can exercise an API. *Fix:* PV requirement — derived interaction surfaces per target type
  (HTTP console from routes/OpenAPI; CLI runner pane); where none derives, acceptance
  explicitly presents test evidence + agent walkthrough as the primary artifact.
- **G-30 · MEDIUM — Deploy provider auth/onboarding is unspecified.** DR-003 executes a
  configured target, but nothing acquires the credential (`vercel login` is interactive);
  first Deploy click would block on a hidden TTY prompt — a terminal-shaped failure for the
  terminal-free persona. *Fix:* DR requirement — targets declare auth needs; guided connect
  flow (provider auth → keychain → verify via dry-run); unmet auth fails before execution
  with the flow offered.
- **G-31 · MEDIUM — Design/visual direction has no artifact, no injection path, no owner.**
  A mockup attached to requirement R1 reaches only streams linked to R1 (AC-010); three
  parallel streams produce three visual dialects, each passing per-story acceptance. *Fix:*
  design-direction artifacts (styleguide/brand/key screens) as project-level session context
  injected into every implementer stream (like EX-006); templates ship a starter; breakdown
  links stories to the design artifacts they must honor; RV-003 shows them beside the preview.
- **G-32 · MEDIUM — Multi-app repos (monorepos) don't fit the one-repo-one-contract model.**
  TP-004 is singular per verb; PV-001 launches "the" dev command; a frontend+backend+lib repo
  has no component concept (BF-005 scopes validation, not contracts). *Fix:* contract may
  declare named components (own commands, preview pattern, path scope); stories/streams bind
  to a component; previews may compose components.
- **G-33 · MEDIUM — Project identity & machine-local state across moves/clones is undefined.**
  Secrets are keyed "per project" with no stable identity across rename/move/re-clone; a fresh
  clone has no checklist of what needs re-establishing (secret values, agent connections);
  transcript references in synced run records dangle on other machines (see G-07). *Fix:*
  stable project id in repo config; on open, report machine-local state to re-establish.
- **G-34 · LOW — Production observability boundary is intended but unstated.** "Build AND
  maintain" invites the expectation; §13 never excludes monitoring. *Fix:* §13 entry — not an
  observability platform; production feedback enters as bugs with external references (BF-007).

## Cluster 8 — Operations under parallel load

- **G-35 · MEDIUM — Provider rate limits/shared quota have no backpressure design.** N streams
  under one subscription is the *default* config; 429s are documented with parallel sessions;
  as specified, a 429 = BD-013 red failure — six dead streams overnight instead of
  pause-and-backoff. *Fix:* BD requirement — throttling is backpressure, not failure:
  auto-pause + retry with backoff, global concurrency downshift, one aggregate notice;
  escalate to red only past a configurable budget. Add the TECH-STACK risk row.
- **G-36 · MEDIUM — Per-stream memory is the real footprint risk and no spike measures it.**
  Agent process + dev server + preview view ≈ 300MB–1.5GB per stream; five streams can exceed
  4–8GB before the shell counts. *Fix:* extend S-4 to measure RSS of full triples on all three
  OSes; derive default stream caps and preview idle-shutdown from data.
- **G-37 · MEDIUM — Windows process-tree and path semantics unaddressed.** Default kills
  orphan dev-server children (ports stay held); Windows termination is abrupt; worktrees ×
  node_modules × MAX_PATH breaks git/tools without `core.longpaths` + long-path opt-in.
  *Fix:* `killDescendants` + port-liveness + health-checked restart in T-011; pnpm shared
  store + longpaths guidance in T-006; S-4 explicitly on a Windows runner.
- **G-38 · LOW — Stub-only CI leaves real-adapter drift structurally undetected.** Adapters
  release weekly; the only live coverage is a manual single-OS pre-release smoke. *Fix:*
  scheduled non-blocking live-agent matrix (dedicated low-cost account) on all three OSes;
  record real sessions, replay as stub scripts so stub fidelity tracks reality. Also resolve
  T-005's "tested in CI" wording (CI covers install/handshake/contract-shape only).

## Cluster 9 — Tech-stack corrections (verified against registries/docs)

- **G-39 · HIGH — CopilotKit dependency reality contradicts two claims.** `@copilotkit/runtime`
  ships ~43 deps including four vendors' LLM SDKs (`openai`, `@ai-sdk/anthropic`, …) — so the
  traceability row "no LLM API dependency anywhere in the tree" is factually false — plus
  opt-out Segment telemetry, install-time Scarf analytics, and a `license-verifier` package;
  all loaded into the privileged main process. Hosting the runtime in Electron is off the
  vendor's documented map (server handlers only; custom-agent path labeled dev-only), and the
  practical shape is an unauthenticated localhost GraphQL endpoint unless hardened; AG-UI
  packages are pre-1.0 (`@ag-ui/core` 0.0.x), not "small and stable." *Fix (keeping the user's
  D-choice):* correct the traceability row; build steps hard-disable telemetry in code and
  neutralize Scarf/license-verifier; loopback-bind + random port + per-launch token for the
  runtime endpoint (or runtime-less custom AG-UI client over IPC — decide in S-2, whose scope
  expands to exactly this); pin `@copilotkit/*` and `@ag-ui/*` exactly per release; dependency-
  audit gate for main-process packages; risk row added. Native-renderer fallback remains the
  escape hatch.
- **G-40 · MEDIUM — Adapter pinning freezes the embedded agent engine; session resume is
  demonstrably fragile.** `claude-agent-acp`/`codex-acp` bundle their engines — pinned adapters
  skew from the user's auto-updating CLIs, and engine bumps can orphan session state ("no
  rollout found" class failures). Also: the official SDK package is `@agentclientprotocol/sdk`,
  not "typescript-sdk". *Fix:* make context re-establishment (fresh session + AC-010 injection
  + per-task commit ledger) the designed recovery path with `session/load` as optimization;
  extend the drift risk row; add resume-after-adapter-upgrade to S-1; correct the package name.
- **G-41 · MEDIUM — Three implementation-layer corrections.** (a) *electron-trpc is effectively
  unmaintained* (last publish 2024; ecosystem forked) — flip T-008's default to the hand-rolled
  zod-validated IPC router (~300 lines), demoting electron-trpc to prior art. (b) *yaml CST has
  no structural-edit utilities* — scalar edits round-trip, but add/remove/append need an owned
  token-splice layer; Document-mode fallback reformats (breaks KB-007 clean diffs); extend S-5
  to add-field/delete-field/append cases. (c) *WebContentsView doesn't expose network capture
  by itself* — needs per-preview session partitions + `webRequest` + a preload error hook;
  extend S-3 to two concurrent previews with correct attribution.

---

## Appendix — Appendix B (lineage) corrections needed in SPEC.md

Inaccurate or incomplete entries found by the regression audit: area **AD omitted entirely**
(G-24) · "VL → VG" omits the **pinning clause** (G-17) and the explicit **report-only CI mode**
(add one clause to VG-010) · "TS/GV → KB" omits **GV-003 profile migration** (G-18) ·
"SK-006 → TM" omits **external notification channels** (Slack/Teams/email/webhook adapters —
either restore as opt-in local adapters or list as left-behind) · "WP → ST/PL" omits **WP-011
coordination artifacts** and "→ TM" omits **UI-016 workload views** (G-28) · "TT → TD/TX" omits
**TT-007 suites** (G-25) · "HS → EX-006" omits **HS-004 guidance-drift detection** (add: exported
AGENTS.md regenerated/staleness-flagged on profile change), **HS-007 per-project human
onboarding**, and **HS-008 team adoption guide** · "staleness subsumed by CH-008" overstates —
**GP-003 semantic spec↔implementation conformance audit** has no home (extend RQ-012 or add
CH-009; the AC-008 reviewer role is the natural executor) · v0.5 **NFR-011 openness/licensing**
was dropped silently — needs an explicit decision (D-114: open-source stance) either way.

## Sources (technical verification)

npm registry (2026-08-13): `@copilotkit/runtime@1.67.1`, `@copilotkit/react-core@1.67.1`,
`@scarf/scarf`, `electron-trpc@0.7.1`, `@agentclientprotocol/claude-agent-acp@0.66.0`,
`@agentclientprotocol/codex-acp@1.2.0`, `@agentclientprotocol/sdk@1.3.0`, `pi-acp@0.0.33`,
`yaml@2.9.0` · CopilotKit self-hosting docs (docs.copilotkit.ai) · Electron docs: webContents,
safeStorage (+ issue #48854; basic_text analyses) · anthropics/claude-code issue #46037
(parallel-session 429s) · JetBrains LLM-27229/LLM-24840 + OpenHands #14260 (ACP resume
failures) · eemeli/yaml docs + issue #308 (CST utilities, keepCstNodes removal) · execa
termination docs (Windows tree-kill) · github.com/copilotkit/copilotkit (MIT).

---

*Recommended disposition: fold G-01..G-38 into SPEC.md as v1.1 amendments (append-only IDs,
per the un-phased rule), G-39..G-41 into TECH-STACK.md v1.1, and re-run this review's
scenario walk on the amended text.*
