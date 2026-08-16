---
type: Guide
title: "IBuildOS — The Team Perspective: Coverage and Gaps"
description: >-
  How a multi-person team (PM, architect, developers, QA, reviewers, manager, stakeholders) works with
  IBuildOS — what the spec covers today, and where the gaps are when humans coordinate with humans.
status: draft
version: 0.1.0
date: 2026-06-30
owner: srini
tags: [ibuildos, guide, team, collaboration, gap-analysis]
---

# The Team Perspective

The [developer journey](DEVELOPER-JOURNEY.md) followed one person, Maya, orchestrating coding agents. This
note changes the lens to a **team**: a PM, an architect/tech lead, several developers, QA, reviewers, an
engineering manager, and stakeholders — all sharing one repo, working alongside agents — and asks the
question you posed: **where are the gaps?**

The short answer, stated up front: IBuildOS treats **agents** as first-class teammates — isolated
workspaces, gating, conflict handling, generated guidance — but it has **almost no model of humans
coordinating with humans**. Authorization, notifications, a personal work queue, human-vs-human concurrency,
human onboarding, and team rituals are largely absent. The journey *works* for a team, but several day-one
coordination needs would push people back to the very tools (Jira, Slack, Confluence) the vision set out to
replace.

---

## What a team can do today

A fair amount is already there. The actors are named as personas — PM, architect, QA, reviewer,
stakeholder, manager `[§4]`. Every artifact has an owner tied to a git identity `[WP-007, WP-008]`. Work is
assignable and plannable on a board `[UI-012]`, and changes — to code and knowledge alike — flow through
reviewable git changes that a person approves in the UI `[VC-001, UI-011]`; agent proposals are reviewed
exactly like human ones `[AG-003]`. Technical decisions are captured as ADRs `[AD-001]`, profile/rule
changes route through PRs `[GV-005]`, and stakeholders get generated change summaries, release notes, and
status reports `[SK-001, SK-002, SK-003]`. Team-level progress, velocity, and release readiness are derived
from the repo `[PM-001, PM-002, PM-003]`.

What's missing is the **connective tissue between people** — the layer that tells a person what's theirs,
routes a change to the right approver, and lets a newcomer find their footing.

---

## The gaps (team lens)

Twelve gaps, grouped into four themes. Severity is High/Medium/Low. Each names the closest existing
requirement and a **proposed** new one (proposed IDs are not yet in the spec).

### A. Roles & authorization — the missing foundation

- **Roles are prose, not data** *(Medium — but the key enabler)*. Personas exist only as text in `[§4]`;
  the system can't reason over "the QA role" or "a reviewer." Almost every gap below needs roles to be a
  first-class, data-driven entity. → *proposed* **TS-010**: define roles as profile data mapping roles to
  git identities/teams, so ownership, assignment, approval, and routing can reference roles, not just people.
- **No authorization / permissions model** *(High)*. In a shared repo, nothing constrains who may edit the
  profile/rules, approve a release, merge to trunk, retire a requirement, or trigger expensive agent/deploy
  runs. Git identity gives *attribution* `[WP-008]`, not *authorization*. → *proposed* **GV-006**: a
  data-driven authorization model for privileged actions, enforced by the gate/branch protection, permissive
  by default for solo use.
- **Approval authority is undefined** *(High)*. Changes route via PR `[GV-005]` and the UI can approve
  `[UI-011]`, but nothing says a *spec* change needs PM/architect sign-off or a *release* needs the manager.
  "Reviewed" is meaningless if anyone can rubber-stamp anything. → *proposed* **GV-007**: let each type
  declare required-approver roles for state transitions; the gate verifies the approval is present.
- **Area/responsibility ownership is under-specified** *(Low–Medium)*. Per-artifact ownership exists
  `[WP-008]`, but the project de-emphasized CODEOWNERS `[D-002]` with nothing replacing area ownership —
  who owns the auth subsystem, the payments domain — which drives review routing and escalation. →
  *proposed* **WP-012**: an optional area-ownership map (component/path/domain → owning role) as in-repo data.

### B. Awareness & coordination — the day-one pain

- **No personal work queue / "what's on my plate"** *(High)*. A teammate's first daily question — what's
  assigned to me, blocked on me, awaiting my review — has no answer. Assignment is a field `[WP-007]`;
  dashboards are team-centric `[UI-003, PM-001]`; nothing is person-centric. → *proposed* **UI-015**: a
  per-identity "my queue" aggregating owned/assigned items, review requests, and blockers.
- **No notifications / @mentions / review requests** *(High)*. Coordination needs *push*, not just *pull*.
  Nothing tells a reviewer a PR awaits them or an owner their requirement changed; `[UI-011]` only works if
  someone happens to look. This silently stalls every handoff. → *proposed* **UI-016**: request review/input
  from specific identities (recorded in-repo) and surface pending requests to the addressed person.
- **Cross-functional handoff state isn't modeled** *(Medium)*. Status lifecycles are per-artifact
  `[WP-003, RM-003, BG-002]`, but a handoff (PM→eng, dev→QA, dev→reviewer) is a coordination event with a
  recipient. The artifact's status is captured; *whose court the ball is in* is not. → *proposed* **WP-010**:
  let transitions designate a next-responsible role ("handoff to") and surface work awaiting that role.
- **No team communication integration (Slack/Teams)** *(Medium–High)*. §1 names Slack as a place knowledge
  scatters and principle 10 is "meet teams where they are," yet there's no way to push review requests,
  gate failures, or release events to chat; `[SK-005]` is outbound stakeholder reports, suggest-only. →
  *proposed* **SK-006**: optional, opt-in notification adapters (Slack/Teams/email/webhook), privacy-respecting.

### C. Concurrency & onboarding

- **Human-vs-human edits of the same artifact are unhandled** *(Medium)*. Agent concurrency is handled with
  care `[VC-004, VC-005, VC-009]`, but two people editing the same requirement/PRD/ADR get a raw text merge
  with no claiming or contention awareness at artifact granularity. → *proposed* **UI-017**: surface when an
  artifact has an in-flight change by another identity and offer optional soft-claim metadata (never a hard lock).
- **No human onboarding — guidance is generated only for agents** *(Medium)*. Init generates `CLAUDE.md` /
  `AGENTS.md` and skills *for agents* `[HS-001, HS-002]`, but nothing orients a new *person*: repo layout,
  this team's workflow/statuses, what their role may do, how to make a first change. `[NFR-015]` documents
  IBuildOS, not this team's process. → *proposed* **HS-007**: generate and maintain human onboarding guidance
  (a CONTRIBUTING/onboarding artifact), kept in sync with the profile `[HS-004]`.

### D. Management & team memory

- **No per-person capacity / workload view** *(Medium)*. Velocity and burn are team-level `[PM-002]`;
  estimates and assignees exist `[WP-005, WP-007]`, but nothing computes load *by person*, so a manager
  can't see that one dev is overloaded and another idle. → *proposed* **PM-007**: per-assignee workload/WIP
  derived from artifact fields and git history.
- **No team coordination artifacts / rituals** *(Medium–Low)*. The base profile models Vision, PRD, ADR,
  Runbook `[§9, TS-008]`, but not standup notes, retro outcomes/actions, or decision-meeting minutes, so that
  coordination memory leaks back to Slack/Confluence — the fragmentation §1 attacks. ADRs cover *technical*
  decisions `[AD-001]`, not *process* ones. → *proposed* **WP-011**: ship optional team-coordination types
  (MeetingNote, RetroAction, StandupLog), disable-able per team.

---

## Summary

| # | Gap | Severity | Anchor → proposed |
|---|---|---|---|
| 1 | Roles are prose, not first-class data (enabler) | Medium | §4 → **TS-010** |
| 2 | No authorization / permissions model | High | GV-005 → **GV-006** |
| 3 | Approval authority undefined (who approves what) | High | GV-005 → **GV-007** |
| 4 | Area / responsibility ownership under-specified | Low–Med | WP-008 → **WP-012** |
| 5 | No personal work queue ("my plate") | High | UI-003 → **UI-015** |
| 6 | No notifications / @mentions / review requests | High | UI-011 → **UI-016** |
| 7 | Cross-functional handoff state not modeled | Medium | WP-003 → **WP-010** |
| 8 | No Slack/Teams notification integration | Med–High | SK-005 → **SK-006** |
| 9 | Human-vs-human concurrent edits unhandled | Medium | VC-009 → **UI-017** |
| 10 | No human onboarding (only agent guidance) | Medium | HS-001 → **HS-007** |
| 11 | No per-person capacity / workload | Medium | PM-002 → **PM-007** |
| 12 | No team rituals / meeting artifacts | Med–Low | TS-008 → **WP-011** |

## Recommended order to close them

1. **Roles as data (TS-010)** first — it's the cheap enabler that unlocks authorization, approval routing,
   notifications, handoffs, and area ownership.
2. **"My plate" (UI-015) + notifications (UI-016)** next — the two most painful day-one gaps; without them a
   team can't operate from the repo and reverts to Jira/Slack.
3. **Authorization + approval authority (GV-006, GV-007)** — makes "reviewed" mean something.
4. Then the rest: handoffs (WP-010), Slack/Teams (SK-006), human onboarding (HS-007), capacity (PM-007),
   concurrency (UI-017), area ownership (WP-012), and team rituals (WP-011).

None of these contradict the existing design; they extend it along the one axis it under-serves — humans
coordinating with humans — while staying git-native, data-driven, and suggest-only.
