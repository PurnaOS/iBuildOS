---
type: Guide
title: "IBuildOS — The Brownfield Team Adoption: Coverage and Gaps"
description: >-
  How an existing team adopts IBuildOS on a years-old codebase — without a big-bang rewrite and without
  stopping feature work — and where the spec falls short of that transition.
status: draft
version: 0.1.0
date: 2026-06-30
owner: srini
tags: [ibuildos, guide, brownfield, adoption, migration, team, gap-analysis]
---

# The Brownfield Team Adoption

The [developer journey](DEVELOPER-JOURNEY.md) and [team journey](TEAM-JOURNEY.md) both started from a clean
slate. This note takes the hardest case you actually face in the real world:

> A ~10-person team with a **years-old repo** — lots of code, partial and outdated docs scattered across
> Jira, Confluence, and Google Docs, an existing CI pipeline, existing test suites, a backlog of open
> issues, and ingrained habits — wants to adopt IBuildOS **incrementally**, without halting feature work and
> without a big-bang rewrite.

**The headline finding:** IBuildOS is excellent at the **steady state** — the loop once everything is
linked, owned, and validated. It has almost **no model of the transition *into* that steady state** for a
team that can't stop the world. The spec assumes you either start greenfield `[IN-002]` or do a one-shot
brownfield "understand-and-restructure" `[IN-003]`. The reality — months of coexistence, legacy debt, and
incremental rollout — is largely unaddressed. And the most important rule for the steady state, *"every
commit must be consistent"* `[VL-012, D-008]`, is the very thing that makes day-one brownfield adoption
impossible unless it is reconciled with a baseline.

---

## What the spec already covers for brownfield

The on-ramp exists in outline. The init CLI detects an existing project, reads its code and docs, and
proposes how to restructure it `[IN-003]`, using a coding harness to comprehend the repo `[IN-004]`; all
brownfield changes are proposed and applied only on approval `[IN-005]`, and re-running init upgrades safely
`[IN-006]`. Existing knowledge can be imported one-way from Jira/Confluence `[IO-004]` or ingested from
spec-driven tools `[IO-003]`. The repo layout — including *which paths count as artifacts* — is configurable
`[KS-004]`, existing code linters are integrated rather than replaced `[CQ-001]`, lint rules can be set to
error/warning/off `[VL-010]`, and removing IBuildOS still leaves a usable repo `[KS-008]`. Agents can draft
and edit artifacts `[AG-002]` and analyze change impact `[AG-005]`.

That's a real foundation. What's missing is everything about surviving the **months in between** — the
transition from a repo that fails the gate catastrophically to one that passes it.

---

## The gaps (brownfield + team lens)

Nine gaps in five themes. Severity High/Medium/Low. Each names the closest existing requirement and a
**proposed** new one (proposed IDs are not yet in the spec).

### A. The transition gate — the load-bearing problem

- **No baseline / grandfathering / ratchet** *(High — the critical one)*. On day one a real repo fails
  the linter by the thousand: orphan code `[TR-005]`, missing owners `[VL-005]`, no requirement↔code↔test
  links. But `[VL-012]` demands the repo "validate cleanly at **every commit**," and `[D-008]`'s invariant
  is "every git commit must be consistent." Taken literally, the team can never go green without backfilling
  the entire history first — the big-bang they're avoiding. `[VL-010]` (rule severity off/warn) is too blunt:
  turning the orphan rule to "warning" globally also disables it for *new* code. What's needed is a recorded
  **baseline** of accepted pre-existing debt, excluded from the gate, so only **new or changed** artifacts
  must pass while legacy debt stays visible and burns down (the standard ESLint-baseline / Sonar-new-code
  pattern). → *proposed* **VL-013**: a committed baseline file + changed-artifacts-only gate mode; the
  baseline may only shrink. **This requires reconciling `[VL-012]`/`[D-008]`** to mean "clean *relative to a
  committed baseline*," or brownfield adoption is impossible as written.
- **No non-blocking CI adoption mode** *(Medium)*. `[VL-008]` ships a CI check and `[IN-009]` wires gates in
  by default — great greenfield, dangerous on brownfield: added as *blocking*, the gate red-lights every PR
  and **halts feature work**, the one thing the team said it can't do. → *proposed* **VL-014**: a report-only
  / non-blocking CI mode that annotates without failing, composes with (never replaces) the existing
  pipeline, and has a documented path from non-blocking to blocking as the baseline shrinks.

### B. Bootstrapping the graph from legacy

- **No retroactive traceability backfill** *(High)*. Every value-add — the chain `[TR-001]`, orphan
  detection `[TR-005]`, test coverage `[TT-005]` — depends on links that a legacy repo simply does not have:
  existing tests `verify` nothing, code has no back-reference, there are no Requirement artifacts at all.
  `[IN-003]`/`[IN-004]` restructure the *layout*; they don't *infer the link graph*. Without agent-assisted
  reverse-engineering, the team faces months of manual link authoring before a single traceability report
  means anything. → *proposed* **IN-010**: use the harness to infer and propose an initial requirement↔code↔
  test graph from existing code, tests, and history, with per-link confidence/provenance for human triage.
- **No bulk / assisted migration at scale** *(Medium–High)*. "Bootstrap a repo" `[IO-004]` hides a scale
  problem: thousands of Jira issues → Bug/Story artifacts, hundreds of existing tests → Test artifacts with
  verify links, owner backfill on every legacy artifact, messy docs classified into OKF types. One-at-a-time
  (even with `[AG-002]`) is infeasible for years of history. → *proposed* **IO-008**: batch migration
  operations — bulk import, bulk owner/User backfill, agent-assisted bulk doc classification via a reviewable
  mapping table, verify-link inference — applied idempotently as reviewable proposals `[IN-005]`.

### C. Living alongside incumbents

- **Import is one-way / import-once; no coexistence or mirror** *(High)*. `[IO-004]` is explicitly a
  one-way, point-in-time dump. During a months-long transition the team still *lives* in Jira/Confluence/
  Slack — new bugs filed in Jira, PMs editing Confluence — so the OKF copy is stale the moment it lands, and
  the team is forced into dual-entry or a hard cutover. Principle 10 is "meet teams where they are," but
  there's no incremental re-import, no read-mirror, no stable external-ID link. → *proposed* **IO-007**:
  incremental re-import + a read-only mirror of incumbents, a stable external-ID on each imported artifact,
  idempotent re-sync, optional outward status reflection (two-way write-back stays opt-in).

### D. Driving and measuring the rollout

- **No phased / path-scoped adoption** *(Medium–High)*. The realistic path is "adopt the payments module
  first, prove it, expand." `[KS-004]` config and artifact globs are *plumbing* that could support this, but
  **partial-bundle adoption is never stated as a strategy**, nor is per-area enforcement (strict inside
  adopted areas, lenient outside). Because it's only latent, implementers may not build it and teams can't
  rely on it. (Intra-repo only, per `[D-005]`.) → *proposed* **IN-011**: phased, path-scoped adoption —
  configurable in-scope areas with the gate strict inside and lenient/off outside, per-area rules added as
  coverage grows.
- **No adoption / migration-progress metric** *(High)*. A lead piloting this must answer "how much of the
  repo is actually managed, and is it growing?" — to justify effort and set ratchet targets. `[PM-004]`
  measures KB *health* as a snapshot and `[PM-005]` gives trends, but nothing measures **adoption coverage**
  (share of code/modules/issues under management) or **migration burndown** (baselined violations remaining).
  Without it the migration flies blind and the ratchet has no target. → *proposed* **PM-008**: adoption
  coverage + migration burndown as a trend over git history.
- **Adoption isn't tracked as IBuildOS work** *(Low–Medium)*. Principle 11 is "dogfood relentlessly"
  `[NFR-015]`, yet nothing models the **migration itself** as artifacts — an "Adopt IBuildOS" initiative,
  per-subsystem epics, backfill/baseline-burndown tasks with owners and a target release `[WP-001]`. Tracked
  in-system, the rollout proves the tool early and earns the adoption metric for free; untracked, it lives in
  a spreadsheet — ironically outside the repo. → *proposed* **IN-012**: scaffold the adoption effort as
  IBuildOS artifacts.

### E. Bringing the team across

- **No change-management onboarding for an existing team** *(Medium)*. `[HS-007]` onboards a *new
  individual* to an *already-running* repo. Brownfield is the inverse and harder: moving an **entire
  established team at once** off Jira-first / Confluence-first / "docs-later" habits. That's change
  management — a rollout runbook, what's changing and why, the new gate/review expectations, how the baseline
  is handled, a staged transition plan the team aligns on — not contributor orientation. → *proposed*
  **HS-008**: a team adoption / change-management guide, distinct from individual onboarding `[HS-007]`.

---

## Summary

| # | Gap | Severity | Anchor → proposed | Tension |
|---|---|---|---|---|
| 1 | No baseline / grandfathering / ratchet | **High** | VL-012 → **VL-013** | **Direct with VL-012 / D-008** |
| 2 | No retroactive traceability backfill | High | IN-003 → **IN-010** | — |
| 3 | Import one-way only; no coexistence/mirror | High | IO-004 → **IO-007** | mild (IO-006 boundary) |
| 4 | No adoption / migration-progress metric | High | PM-004 → **PM-008** | — |
| 5 | No bulk / assisted migration at scale | Med–High | IO-004 → **IO-008** | — |
| 6 | No phased / path-scoped adoption | Med–High | KS-004 → **IN-011** | bounded by D-005 |
| 7 | Existing-CI non-blocking mode missing | Medium | VL-008 → **VL-014** | mild (IN-009 default-on) |
| 8 | No team change-management onboarding | Medium | HS-007 → **HS-008** | — |
| 9 | Adoption not tracked as IBuildOS work | Low–Med | NFR-015 → **IN-012** | — |

## The through-line, and what to fix first

One gap is load-bearing: **the baseline/ratchet (VL-013)**. Without it, the CI gate halts feature work
(gap 7), there's no burndown to measure (gap 4), enforcement can't be lenient outside adopted areas (gap 6),
and the backfill work (gaps 2, 5) has no safe place to land. So:

1. **Reconcile `VL-012`/`D-008` and add the baseline (VL-013)** — redefine "consistent" as *clean relative
   to a committed baseline / for changed artifacts*. This is the single highest-leverage change; nothing else
   brownfield works without it.
2. **Non-blocking CI mode (VL-014)** — so adopting the gate never red-lights in-flight work.
3. **Retroactive backfill + bulk migration (IN-010, IO-008)** — bootstrap the graph and move the back-catalog.
4. **Coexistence (IO-007), phased rollout (IN-011), adoption metrics (PM-008)** — survive the transition and
   steer it.
5. **Team change-management onboarding (HS-008)** and **adoption-as-tracked-work (IN-012)** — bring the
   people across and dogfood the rollout.

The spec describes a destination very well. These additions describe the road to it — which, for any team
not starting from zero, is most of the actual work.
