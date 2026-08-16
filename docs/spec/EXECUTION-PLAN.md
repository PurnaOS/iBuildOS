---
type: ExecutionPlan
title: "iBuildOS — Execution Plan (Build-Ready Kit #2)"
description: >-
  The delivery sequencing the SPEC deliberately excludes: nine milestones M0–M8 with
  per-milestone acceptance oracles, the bootstrap ladder resolving the circular dependencies,
  spike gating, parallelization lanes, and the Builder Charter granting an autonomous agent
  the decision authority to build without asking questions.
status: draft
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, execution-plan, milestones, builder-charter, build-ready-kit]
---

# Execution Plan

**Inputs:** SPEC.md v1.2 (252 requirements, un-phased by design) · TECH-STACK.md v1.1 ·
FORMATS.md (formats/1) · DEFAULTS.md · ACCEPTANCE.md · DESIGN-CHARTER.md · PROVISIONING.md.
**Nothing is cut here** — sequencing only, per the standing scope rule. Estimates are omitted
deliberately: milestones gate on *oracles*, not dates.

---

## 1. The Builder Charter (decision authority — read first)

This charter converts "would ask" into "decides and records." It applies to any agent (or
fleet) executing this plan.

1. **Never ask; decide and record.** Where SPEC/FORMATS/DEFAULTS/DESIGN-CHARTER leave a point
   open, choose the most conventional option consistent with the design principles, record it
   as a Decision artifact (`DC-…`, per FORMATS §2) in the iBuildOS repo itself, tag it
   `builder-decision`, and proceed. Srini reviews Decision artifacts post-hoc; a reversed
   decision is a normal change, not a failure.
2. **Formats are frozen; behavior is buildable.** FORMATS.md is normative — do not invent
   alternative serializations. A genuine formats gap is the one exception to rule 1: record
   the gap as a Decision *proposing* the format, implement behind it, and flag it
   `formats-gap` for priority review.
3. **Dogfood from M1 onward.** The iBuildOS repo manages its own development as iBuildOS
   artifacts the moment the engine can validate them (bootstrap ladder, §3). Before that,
   work items live as ordinary markdown ADRs/checklists — migrated at M1.
4. **Live legs defer, stub legs gate.** Every spike/test with a live-agent or provisioned
   dependency (PROVISIONING.md) has a stub leg that gates progress and a live leg that runs
   when credentials land. Missing provisioning never blocks a milestone except M8.
5. **Scope boundary of autonomy:** signing, notarization, publishing (npm/GitHub Releases),
   deploy-target verification, and the live-agent matrix are executed only when the
   provisioning pack supplies credentials; until then produce release-candidate artifacts and
   a checklist of exactly what awaits keys.
6. **Per-work-item protocol:** write/update the artifact (story/task with acceptance from
   ACCEPTANCE.md) → implement with tests (TD-005 policy applies to iBuildOS itself) → gates
   green → land via the merge discipline this product preaches (small, reviewable, trailer-
   attributed commits).
7. **Sequencing inside milestones is the builder's** — reorder freely; the milestone oracle is
   the contract. Cross-milestone reordering requires a `builder-decision` record.

## 2. Milestone map

```
M0 Foundations ─┬─▶ M1 Engine ──▶ M2 Streams substrate ──▶ M3 ACP layer ─┐
                └─▶ M4 Shell & Knowledge UI (parallel lane from M0) ◀────┤
                                                                         ▼
                              M5 Conversation & Breakdown ──▶ M6 BUILD LOOP (First Usable)
                                                                         ▼
                                             M7 Change · Team · Brownfield · Insights
                                                                         ▼
                                             M8 Delivery · Packaging · Live verification
```

Two parallel lanes after M0: the **engine lane** (M1→M2→M3) and the **surface lane** (M4)
meet at M5. A solo builder interleaves; a fleet splits.

## 3. The bootstrap ladder (resolves the circularities)

1. **Formats before engine:** FORMATS.md fixtures are committed first (M0); the engine is
   built *against* them — no format is invented in code.
2. **Engine before dogfood:** at M1-exit the engine validates the iBuildOS repo's own bundle;
   the plan's remaining work migrates into artifacts then (charter rule 3), satisfying
   NFR-015 without requiring the tool before the tool.
3. **Profile before UI generation:** the default profile (FORMATS §5) ships in M1; M4's forms/
   boards/colors generate from it (KB-005) rather than hardcoding.
4. **Catalog before bridge:** GU component schemas land in `packages/schemas` during M0 (they
   are types, not UI); the M5 bridge implements against them; S-2 proves the round-trip before
   M5 UI work builds on it.
5. **Stub before live:** the stub agent (M0) speaks full ACP including the FORMATS §10
   convention, so every later milestone is testable without provisioning.

## 4. Milestones

### M0 — Foundations & spikes
Monorepo (TECH-STACK §3) · pnpm/Turborepo/CI skeleton (lint, typecheck, test on 3 OSes) ·
`packages/schemas` (zod: artifacts, config, findings JSON, GU catalog v1 envelopes) ·
FORMATS fixtures + S-5 YAML corpus committed · **stub ACP agent** (scenario-scripted, speaks
sessions/updates/permissions/fs/terminal + FORMATS §10 carriers) · in-house typed IPC router
(T-008) skeleton · **Spikes: S-5, S-2 (both shapes, decision recorded per DEFAULTS #10), S-3,
S-4 (all-OS, RSS numbers → replace DEFAULTS #8 placeholder), S-1 stub leg.**
**Oracle:** all five spikes green on stub legs; conformance fixtures round-trip byte-stable;
CI green on macOS/Windows/Linux runners *(runners need PROVISIONING §3 — until then, Linux
container CI + local-machine matrix per charter rule 4)*.

### M1 — Engine & CLI (the deterministic core)
`packages/engine`: OKF store (CST two-tier editing) · profile registry + meta-validation ·
default profile authored (FORMATS §5, all §11 types) · rule registry + gate engine (FORMATS
§6) · graph + queries (TR) · baseline (FORMATS §8) · incremental watcher · `packages/cli`
(FORMATS §12 surface) + `packages/action`.
**Oracle:** golden-repo fixtures validate with expected findings JSON, byte-identical across
OSes and across app/CLI (NFR-005/VG-010) · NFR-004 perf numbers hit on a 5k-artifact synthetic
repo · **the iBuildOS repo itself validates clean and its remaining plan migrates to artifacts
(dogfood begins)** · ACCEPTANCE.md rows for areas KB, VG, TR all green.

### M2 — Streams substrate (git, worktrees, merge queue)
Worktree lifecycle · claims (BD-017) · scheduler with `depends_on` + collision avoidance ·
**merge queue as coordinator**: provisional-ID finalization (FORMATS §2), ordered-resource
serialization (IG-011), supersession, trunk-broken state (IG-010), rebase policy (IG-007) ·
contract runner (execa, tree-kill, TOFU trust flow TP-008, trunk-resolved commands) ·
environments + safeStorage (T-010, backend detection).
**Oracle:** scripted multi-stream torture test (stub agent): two streams mint colliding
provisional IDs → queue finalizes + rewrites, `id/*` rules enforce · parallel migration
streams serialize · superseded stream pauses · kill −9 mid-stream → BD-014 recovery to last
task · ACCEPTANCE rows for BD (substrate half), IG, GH-001..004 green.

### M3 — ACP layer
`packages/acp`: registry (tier-1 definitions + custom), capability negotiation, sessions,
scoped fs/terminal services, permission broker (AC-006 + secret-request routing AC-013),
transcripts (machine-local, redaction), MCP passthrough incl. the bundled `ibuildos-ui` MCP
server (FORMATS §10 carrier A), run records.
**Oracle:** S-1 stub scenarios green incl. permission flows, secret-request round-trip
(value never in transcript — asserted), throttle → BD-016 backpressure behavior; live leg
queued for provisioning · ACCEPTANCE rows for AC green (stub-verifiable subset).

### M4 — App shell & knowledge UI (parallel lane)
Electron shell (multi-project home, project create/open + TOFU, mode switch, palette, attention
queue skeleton) · profile-generated forms/boards/detail views (KB-005) · requirements studio
(manual paths: RQ-001..005, 007..011) · artifacts/trace/problems views · settings · onboarding
shell. Design per DESIGN-CHARTER (tokens, nav map, vocabulary glossary).
**Oracle:** Playwright: create project from template fixture → author requirement via form →
validate live → board drag persists state legally · PS-006 vocabulary lint (glossary-based)
passes on all Product-mode strings · ACCEPTANCE rows for PS (shell subset), RQ (manual
subset), PL green.

### M5 — Conversation & breakdown
Bridge per S-2 decision + CopilotKit surfaces (hardening per T-004) · GU catalog v1 rendering ·
requirements interview (RQ-006) · AI breakdown → plan-tree change-sets (ST-003/008, TD-002,
VG-011 simulation) · role instructions + house-rules injection (AC-010, EX-006 export).
**Oracle:** narrative §7.1 through plan approval, fully driven by the stub agent's scripted
interview — question cards round-trip, plan applies transactionally, gates green ·
ACCEPTANCE rows for GU, ST, TD (design half) green.

### M6 — The build loop ⭐ **FIRST USABLE**
Streams UI (both modes) · dial (D-115 semantics incl. dial-waived records) · previews (T-011
partitions/capture; PV-008 API console + CLI runner surfaces) · test execution + results
(TX) · acceptance flow (RV-003/004) · merge-to-trunk UX · steering, questions, failure
remediation (BD-008..013).
**Oracle — the headline:** **narrative §7.1 green end-to-end on the stub agent**: brief →
interview → breakdown → parallel streams → question card mid-build → acceptance via preview →
merge → trunk preview → (deploy stubbed) — as a Playwright run on all three OSes. Plus
ACCEPTANCE rows for BD (UX half), PV, TX, RV.

### M7 — Live product: change, team, brownfield, insights
Live Change Management (CH incl. CH-009 undo, CH-010 conformance audit) · team (TM: sync
notifications, my-queue, handoffs, workload IN-008, adapters TM-008) · brownfield (BF flow
incl. backfill batches + baseline) · DA area · insights dashboards + digests · GH-005/007
forge integration (fixture-based until provisioning).
**Oracle:** narratives **§7.2, §7.3, §7.4** green on stub agent + git fixtures ·
ACCEPTANCE rows for CH, TM, BF, DA, IN green.

### M8 — Delivery: templates, packaging, live verification *(provisioning-gated)*
The three template repos + template CI (TP-003 guarantee) · deploy connect flows (DR-008)
against real providers · packaging/signing/notarization + auto-update (T-014) · docs site +
in-app manual final · **live-agent matrix + S-1/S-2 live legs + the pre-release manual smoke
(PROVISIONING §7 ruling)** · Apache-2.0 LICENSE files per open-core package + license headers ·
public repo hygiene (NFR-016).
**Oracle:** TP-003 zero-fix template guarantee on all three templates · signed installers
install + auto-update on all three OSes · narrative §7.1 executed once per tier-1 agent
(Claude Code, Codex, pi) live · release checklist fully green.

## 5. Continuous obligations (every milestone)
Gates green on the dogfooded repo from M1 · determinism suite in CI · dependency-audit gate on
main-process packages (G-39) · ACCEPTANCE.md rows flipped with evidence links as areas land ·
Decision artifacts for every charter-rule-1 invention · CHANGELOG.

## 6. Fleet note (optional parallelization)
With multiple agents: lane split per §2; within M6+, one agent per SPEC area with the merge
queue (built in M2) coordinating — iBuildOS's own discipline applied to building iBuildOS.
The stub agent doubles as the fixture for testing that very coordination.

*End of execution plan. Sequencing decisions from here down are the builder's (charter §1.7).*
