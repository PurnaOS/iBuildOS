---
type: DecisionRecord
title: "iBuildOS — Shipped Defaults (Build-Ready Kit #3)"
description: >-
  Every policy the SPEC names without a value, resolved: the defaults iBuildOS ships with.
  All are configuration data (ibuildos.yaml / profile), changeable per project; these are the
  values that apply when nothing is configured. Closes BUILD-READINESS DECISION stalls 20-21
  and the subjective spike thresholds (stall 38).
status: approved-pending-review
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, defaults, build-ready-kit]
---

# Shipped Defaults

| # | Policy (SPEC ref) | Shipped default | Rationale |
|---|---|---|---|
| 1 | Autonomy dial default (BD-004/D-105) | **`cruise`** | Green gates flow, humans keep acceptance and merge — the trust-building middle. `auto` is one click away once earned. |
| 2 | Remote sync (GH-003) | Fetch every 5 min + on window focus; push automatically on merge-queue landing and on artifact save when a remote is configured; manual sync always available | Team state (claims, assignments) must travel fast; 5 min bounds the BD-017 race window. |
| 3 | Preview data-state (PV-009) | Trunk preview: run `migrate` + `seed` automatically on trunk advance. Stream previews: run `migrate` automatically, prompt before `seed` reset (may destroy manual test data) | Trunk must always be demo-able; stream data may be mid-manual-test. |
| 4 | Engine-version mismatch (VG-012) | UI: **warn banner + refuse to auto-advance gates** (manual advance allowed with recorded override). CLI/CI: **refuse, exit code 3** | CI is the enforcement backstop and must be strict; a human at the UI can make an informed exception, recorded. |
| 5 | Release readiness threshold (DR-004) | 100% of release-scoped stories `accepted`-or-`done` + release suite (TD-009) green + zero open `blocker`-severity bugs in scope | Anything less is a policy choice a team should make deliberately. |
| 6 | Review surface satisfying merge approval (RV-001) | **Product-mode acceptance suffices**; Engineering-mode review is additive, required only when the profile says so (e.g., for streams touching contract/scripts per TP-008, engineering review is required) | Matches the PM-first promise while forcing technical eyes exactly where risk concentrates. |
| 7 | Change significance rules (CH-001) | **Significant** (creates/attaches a Change, triggers CH-003 impact): any edit to acceptance criteria, requirement body normative text (EARS/shall statements), priority, or typed links; state transitions to `retired`. **Not significant** (plain edit, history via git): title, tags, formatting/typo edits, attachment additions, owner/assignee changes | Deterministic, field-based, no AI judgment needed in the hot path. |
| 8 | Stream concurrency cap (BD-015) | **3** until Spike S-4 data replaces it (then: derived per-machine from the S-4 formula) | Conservative placeholder honoring the memory-audit finding; prevents day-one machine melt. |
| 9 | Throttling retry budget (BD-016) | Backoff 30 s → 2 m → 5 m → 10 m (jittered), global concurrency halves after 2nd consecutive throttle, escalate to BD-013 red after 60 min without progress | Overnight `auto` runs survive rate windows; sustained failure still surfaces. |
| 10 | Spike S-2 tie-breaker | If both shapes pass: **runtime-less custom AG-UI client over IPC wins** — fewer main-process dependencies, no localhost endpoint to harden, smaller supply-chain surface. Choose runtime-in-main only if a required CopilotKit feature demonstrably needs it (name it in the decision record) | Security-first default; the decision record carries the burden of proof the other way. |
| 11 | Spike S-4 acceptance bar | Average RSS ≤ 1.2 GB per full stream triple; total ≤ 8 GB at the default cap on a 16 GB machine; p95 UI interaction < 100 ms during the run (NFR-003) | Concrete numbers so the spike can pass/fail without a human judgment call. |
| 12 | Spike S-5 corpus | Committed at `packages/engine/fixtures/yaml-corpus/` — minimum 25 files covering: comments (leading/inline/trailing), anchors/aliases, flow + block sequences, CRLF, no-trailing-newline, unicode keys, deep nesting, multi-doc rejection | The corpus is part of the kit, not an exercise left to the builder. |
| 13 | CLI bin name (T-009) | **`ibuildos`** (npm package `@ibuildos/cli`, bin `ibuildos`); `ibuild` is taken on npm (verified) and is not used anywhere | One name, no squatting dispute, no confusion with the 2020 package. |
| 14 | Stream → remote shape (IG-005) | Default: local merge queue, branches pushed for backup after landing. PR-per-stream mode **off** by default, one toggle in `ibuildos.yaml` for teams that review in their forge | Solo-first default; team switch is data. |
| 15 | Notification adapters (TM-008) | All **off** by default (opt-in per SPEC); OS notifications **on** for the attention queue (PS-009) | Privacy default; the app is still useful loud-free. |
| 16 | Worktree GC | Worktrees removed on stream completion after landing; kept 7 days after abort/reject (inspectable state, BD-013), then GC'd with the branch retained | Disk hygiene without destroying evidence. |
| 17 | Transcript retention | Machine-local transcripts kept 90 days or 5 GB (LRU), whichever first; run-record summaries (in-repo) are permanent | Bounded local disk; the durable audit lives in the repo per AC-012. |
| 18 | Dial-waived review queue (D-115) | Waived acceptances surface in the attention queue for 14 days; unreviewed after that they auto-archive as `accepted (dial-waived, unreviewed)` — never silently dropped, never eternally nagging | Honest bookkeeping without notification fatigue. |
| 19 | Default environments (PV-005) | Every project starts with `local`; templates add `staging` + `production` wired to their deploy targets | Matches the template deploy story out of the box. |
| 20 | Agent role defaults (AC-008) | All roles default to the first connected tier-1 agent; roles are independently overridable in `ibuildos.yaml` | Zero-config start; specialization is opt-in. |

**Status.** These defaults ship in the default profile / `ibuildos.yaml` template and are
normative for the builder. Srini reviews this sheet once; objections change the table, silence
approves it. Everything here is a data edit later — nothing is baked into code.
