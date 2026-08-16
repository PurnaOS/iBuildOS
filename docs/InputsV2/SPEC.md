---
type: ProductSpecification
title: "iBuildOS — Product Specification: The UI-Driven Round"
description: >-
  The complete requirements for iBuildOS as a UI-driven application-building platform:
  a desktop app where product people and architects define what to build, AI coding
  agents (via the Agent Client Protocol) build it in parallel, and everything —
  requirements, stories, tests, code, decisions — lives as structured knowledge in one git repo.
status: draft
version: 1.2.0
date: 2026-08-14
owner: srini
tags: [ibuildos, spec, ui-driven, acp, okf, generative-ui, parallel-agents, sdlc]
supersedes-context: "REQUIREMENTS.md v0.5.0 (2026-06-30) remains as archived reference; this is a fresh specification for a new product round."
---

# iBuildOS — Product Specification (UI-Driven Round)

> **What this is.** The single authoritative statement of what iBuildOS must be and do in this
> round: a **UI-driven application-building platform**. It is written fresh for this product —
> the previous master catalog (v0.5, CLI-era) is an archived reference, mined for concepts but
> not carried forward wholesale. Like its predecessor, this document is deliberately
> **scope-complete and un-phased**: nothing is cut, nothing is sequenced into "MVP vs later."
> Sequencing lives in the separate execution plan.

---

## Table of Contents

0. [About this document](#0-about-this-document)
1. [Vision & problem statement](#1-vision--problem-statement)
2. [Product definition](#2-product-definition)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Design principles](#4-design-principles)
5. [Personas & modes](#5-personas--modes)
6. [Core concepts & vocabulary](#6-core-concepts--vocabulary)
7. [The product experience (narratives)](#7-the-product-experience)
8. [Conceptual architecture](#8-conceptual-architecture)
9. [Functional requirements (by capability area)](#9-functional-requirements)
10. [Non-functional requirements — `NFR`](#10-non-functional-requirements--nfr)
11. [Data model & default type profile](#11-data-model--default-type-profile)
12. [Decisions](#12-decisions)
13. [Boundaries (explicit non-goals)](#13-boundaries-explicit-non-goals)
- [Appendix A — Coverage map (the brief → requirements)](#appendix-a--coverage-map)
- [Appendix B — Lineage from v0.5](#appendix-b--lineage-from-v05)
- [Appendix C — References](#appendix-c--references)

---

## 0. About this document

**Purpose.** Define iBuildOS clearly enough that humans and AI agents can build, validate, and
extend it — while leaving room to grow scope without restructuring the document.

**Requirement keywords.** *Shall* = mandatory. *Should* = strongly recommended. *May* = optional.
Every requirement has a stable ID `AREA-NNN` (e.g., `RQ-001`). IDs are never reused or renumbered;
new requirements take the next free number in their area, so the catalog grows by appending.

**Scope stance.** *Everything in, no phasing.* This catalog states the full product. Delivery
sequencing, prioritization, and cut lines are decisions made **against** this catalog in the
execution plan — never **inside** it.

**Relationship to v0.5.** The previous master specification (144 requirements, 21 areas) described
a CLI-first, linter-centric system with a UI on top. This round inverts that: the UI **is** the
product. Concepts that survive (OKF storage, self-describing type profiles, deterministic
validation, typed traceability, worktree parallelism) are re-specified here in their new context;
v0.5 requirement IDs are not reused. Appendix B records the lineage. No code from the previous
implementation carries forward (decision D-103).

**Implementation neutrality.** This document specifies behavior, not technology. The
implementation stack (languages, frameworks, desktop shell, protocol libraries) is chosen in the
separate tech-stack phase and recorded there. Where the spec names a protocol (git, OKF, ACP), the
protocol is a requirement; where it names a product (Claude Code, GitHub), it is an example.

**Revision 1.1.0 (2026-08-14).** Incorporates the findings of the adversarial gap review
(`REVIEW-GAPS.md`, G-01..G-41 plus addendum G-42): new requirements appended (IDs never
renumbered), amended clauses marked *(1.1)* in place, §11 data model extended, a new area `DA`
added, decisions D-114/D-115 recorded, and Appendix B corrected.

---

## 1. Vision & problem statement

Building software still requires a translator class. A product person who knows exactly what they
want must route it through tickets, documents, meetings, and a development team before anything
runs. Meanwhile AI coding agents have become genuinely capable of building and maintaining real
applications — but they are wrapped in developer-shaped tools: terminals, IDE panes, and CLI
sessions that a product person will never operate, producing work that lands in places
(branches, diffs, logs) a product person will never look.

The previous rounds of iBuildOS solved the *knowledge* half of this problem: the git repository as
the single source of truth for the whole lifecycle — requirements, plans, tests, decisions, and
code together, stored in an open format, kept honest by a deterministic validator. What they did
not solve is the *access* half: the person with the product intent still needed a terminal.

**This round makes iBuildOS a product-shaped application-building platform.** A desktop app where:

- A **product person records what the product must do** — by filling guided forms or by talking
  to an AI that interviews them — and the result is structured, versioned requirements.
- Requirements become **user stories, tasks, and test cases** through AI-assisted breakdown the
  human refines and approves.
- **AI coding agents build the product** — several at once, each in an isolated workspace —
  driven entirely from the UI through the open **Agent Client Protocol (ACP)**, so any capable
  coding agent (Claude Code, Gemini CLI, Codex, Goose, …) can do the work.
- The person **watches the product take shape live** — running previews, passing tests, progress
  against requirements — and **changes the requirements mid-flight**, with the system computing
  the impact and re-planning.
- Every fact — requirement, story, test, decision, run, release — is a version-controlled
  **OKF document in the repo**, so the project outlives the tool, diffs cleanly, and is equally
  readable by humans, agents, and CI.

The end state: **a product person and an architect can take an idea to a running, tested,
maintained application** — and a developer who joins later finds not a haunted codebase but a
fully documented, traceable project they can pick up in an afternoon.

---

## 2. Product definition

**iBuildOS is a desktop application** (macOS/Windows/Linux) that manages any number of local
**projects**, each backed by a git repository. Per project it offers two first-class workspaces —
**Product mode** (requirements, stories, acceptance, previews, progress) and **Engineering mode**
(code, diffs, branches, streams, gates) — over one shared model. It embeds no AI of its own:
all intelligence comes from **pluggable ACP agents** the user connects, using the agent's own
authentication. It runs entirely locally; the git remote is the only sharing mechanism. A
**headless CLI** ships alongside the app so CI can run the same deterministic validation gate.

**What it is not:** a hosted SaaS, a new version-control system, a new file format, an IDE, or an
AI vendor. Remove iBuildOS and the repo remains a usable, readable pile of markdown + code.

---

## 3. Goals and non-goals

**Goals**

- Let a product person build and maintain real software end-to-end from a UI — no terminal, no
  git vocabulary required in Product mode.
- Keep the architect/engineer a first-class peer: full technical depth (diffs, branches, streams,
  profiles, gates) one mode away, never bolted on.
- Make parallelism the normal case: many stories being built at once by isolated agents, visibly.
- Keep requirements alive: changing them mid-build is a supported, impact-analyzed, re-planned
  workflow — not an exception.
- Stay agent-agnostic via ACP: the user's choice of coding agent is a configuration, not a fork.
- Keep the repo the single, open source of truth (OKF documents + code), checkable by a
  deterministic gate with no AI and no network.
- Make interaction effective through chat + generative UI: agents ask, propose, and report
  through structured interactive components, not walls of text.
- Be trustworthy by construction: agents work only in isolated workspaces; nothing reaches the
  trunk without passing deterministic gates; the autonomy dial governs how much a human clicks.

**Non-goals** (elaborated in §13)

- Not a hosted collaboration service — collaboration is git-mediated.
- Not a bespoke VCS or file format — always git, always OKF.
- Not an AI vendor — no bundled model; agents bring their own.
- Not an IDE or general code editor — code editing happens through agents or the user's editor.
- Not a universal CD platform — one-click deploy is scoped to the template/project contract.

---

## 4. Design principles

1. **The repo is the product's memory.** Every fact that matters — requirement, story, test,
   decision, run, release — is a version-controlled OKF artifact next to the code. UI state is
   derived, never authoritative.
2. **UI-first, CLI-underneath.** Every workflow is completable in the UI; the headless CLI exists
   for CI and automation, not as the primary interface.
3. **Two modes, one model.** Product and Engineering modes are different projections of the same
   artifacts and the same graph — never two databases, never two truths.
4. **Agents build, gates decide.** All AI work happens in isolated workspaces. The deterministic
   gate — schema, links, chain, tests — is the authority on "done"; no agent and no human
   opinion overrides a red gate on the trunk.
5. **Autonomy is a dial, not a debate.** The same pipeline serves "approve every step" and
   "run until built"; the dial decides which green gates auto-advance. Red gates always stop.
6. **Harness-agnostic by protocol.** The platform speaks ACP and only ACP to agents. Any agent
   that speaks it — first-party or adapter-wrapped — is a full citizen.
7. **Conversation with structure.** Agents interact through generative UI — clarifying-question
   forms, plan cards, approval widgets, diff summaries — so a product person makes real decisions
   without reading raw output.
8. **Self-describing process.** Artifact types, fields, statuses, links, and workflow rules are
   data in the repo (the type profile), not logic in the app. Editing data changes what is enforced.
9. **Deterministic first, AI second.** Structure is checked by a fast offline validator;
   AI adds judgment (drafts, gaps, contradictions, resolutions) on top, always attributably.
10. **Live requirements.** A requirement change during a build is a first-class event: impact is
    computed, plans are revised as reviewable proposals, in-flight work is redirected.
11. **No lock-in, ever.** Open formats, git-native distribution, agent's own auth. Deleting
    iBuildOS leaves a usable repo; another OKF/git tool can pick it up.
12. **Dogfood relentlessly.** iBuildOS's own lifecycle is managed as iBuildOS artifacts; its repo
    is its first validation target.

---

## 5. Personas & modes

**Personas**

- **Product Builder (primary).** A product manager, founder, domain expert, or "product guy" —
  articulate about *what* and *why*, not fluent in git or code. Lives in Product mode. Records
  requirements, approves breakdowns, watches builds, accepts stories via preview and criteria,
  changes requirements as understanding grows.
- **Architect (primary).** Technically fluent; owns the type profile, project contract, stack
  choices, agent configuration, gates, and merge policy. Moves between both modes; handles
  escalations (conflicts the agent can't cleanly resolve, red gates, structural decisions).
- **Engineer (secondary).** May not exist on a given project. When present, works in Engineering
  mode: reviews diffs, steers streams, occasionally writes code directly through their own tools —
  the repo is plain git, so nothing stops them.
- **QA / Test Designer (secondary).** Owns test-case quality and coverage; may be the Product
  Builder wearing another hat.
- **Stakeholder (consumer).** Reads generated digests, release notes, and dashboards; rarely edits.
- **AI coding agent (first-class actor).** Any ACP-speaking agent. Drafts requirements and plans,
  writes code and tests, resolves conflicts, explains changes — always inside an assigned
  workspace, always attributed, always subject to gates.

**Modes** (see PS area)

- **Product mode** speaks the language of products: requirements, stories, acceptance criteria,
  previews, progress. Git, branches, diffs, and file paths are never required; agent activity is
  summarized in product terms ("Implementing: password reset — 3 of 5 tasks done, tests passing").
- **Engineering mode** speaks the language of software: streams, worktrees, branches, diffs,
  commits, gates, profiles, raw OKF. Everything Product mode shows is inspectable here at
  full technical depth.
- Both modes are always available per project; a user's mode choice is a preference, not a
  permission. Deep links can cross modes (an acceptance card can open the underlying diff).

---

## 6. Core concepts & vocabulary

- **Project.** One application under management: a git repository + its knowledge base + its
  configuration. The desktop app manages many projects.
- **Knowledge base.** The OKF bundle inside the repo: all non-code artifacts as markdown files
  with YAML frontmatter, cross-linked into a typed graph.
- **OKF (Open Knowledge Format).** The storage convention: a bundle of concepts (markdown +
  frontmatter with a required `type`), permissively consumable. Adopted as-is, not forked.
- **Type profile.** The project's self-describing schema: artifact types, fields, statuses,
  typed relationships, and workflow rules — stored as OKF documents, editable per project.
- **Requirement.** A statement of what the product must do (functional or non-functional), with
  stable ID, owner, status, acceptance criteria, and links.
- **Story.** A user-valued slice of a requirement (`implements` it), with acceptance criteria,
  estimate, dependencies, and status. **Task:** an implementation step under a story, pointing at
  the code it produces. **Test case:** a first-class verification artifact (manual or automated)
  that `verifies` requirements/stories.
- **Change.** A recorded evolution of requirements after work has begun: why, what changed, the
  computed impact, and the re-plan that followed.
- **Stream (build stream).** One unit of parallel execution: an isolated git worktree on its own
  branch + one ACP agent session + an assignment (story or task set). Streams are created,
  watched, steered, and merged from the UI.
- **Run.** One recorded agent execution within a stream (prompt turns, tool calls, outcome),
  persisted as an artifact for audit.
- **Gate.** A named, profile-defined bundle evaluated at a defined point (requirement ready,
  story ready, plan, stream stage/done, merge, release): **deterministic checks** (schema, links,
  chain, statuses — bit-reproducible from files + profile) plus **recorded execution evidence**
  (test, lint, and optional CI results captured against a specific commit). Given the same
  commit, profile, engine version, and recorded evidence, a gate's verdict is identical in UI
  and CI (VG-012/VG-013).
- **Autonomy dial.** The per-project (and per-run) setting governing which *green* gates and
  approval points auto-advance without a human click: `step` (every stage and approval point
  waits), `cruise` (green gates auto-advance; stops at decision points, story acceptance, and
  merge), `auto` (green merges and acceptances proceed too, recorded as dial-waived — see
  BD-004/D-115). **Decision points** — which stop at every level — are: agent questions
  (BD-012), breakdown and change-set approvals (ST-003, CH-004), and secret requests (AC-013).
  Red gates always stop. Per-gate overrides are profile data (EX-004).
- **ACP (Agent Client Protocol).** The open JSON-RPC protocol between the platform and coding
  agents: `initialize` capability negotiation, `session/new` / `session/load`,
  `session/prompt` turns, streamed `session/update` notifications (message chunks, thoughts,
  tool calls, plans), `session/request_permission`, client-provided file-system and terminal
  methods, `session/cancel`, `session/set_mode`.
- **Generative UI.** Structured, interactive components emitted by agents and rendered natively
  by the app — question forms, option pickers, plan trees, approval cards, diff summaries —
  instead of (or alongside) prose.
- **Project contract.** The per-project manifest declaring how to develop this app: commands for
  dev server, test, lint, seed, build, deploy; preview URL pattern; stack metadata. Templates
  ship it pre-filled; agents can derive it for existing repos.
- **Template.** A starter kit for a new application: scaffold + pre-filled project contract +
  known-good preview/test/deploy behavior.
- **Baseline.** The committed record of accepted pre-existing validation debt in a brownfield
  repo; the gate blocks only new violations, and the baseline only shrinks.

---

## 7. The product experience

Four narratives that the requirements in §9 must make true. Requirement IDs in brackets point at
the clauses that guarantee each step.

### 7.1 Priya builds a product from an idea (greenfield, Product mode)

Priya, a product manager, opens iBuildOS and creates a project: she names it, picks the "Web app"
template, and the app scaffolds a repo with a working skeleton, a project contract, and an empty
knowledge base `[PS-004, TP-002, TP-003]`. She connects her coding agent — the app detects her
installed ACP agents and she picks one; it authenticates with her existing subscription `[AC-002,
AC-005]`.

She starts talking: "I want a tool where our field engineers log equipment inspections offline and
sync later." The agent interviews her — through rendered question cards, not prose: who are the
users? what must work offline? what does a report contain? `[GU-003, RQ-006]`. Behind the
conversation, structured requirements accumulate in a side panel as OKF documents — each with an
ID, acceptance criteria, and links — which she can edit directly in guided forms at any moment
`[RQ-002, RQ-004, RQ-007]`. When she's satisfied, she marks the set ready `[RQ-009]`.

She clicks **Break down**. The agent proposes stories with acceptance criteria and dependencies,
plus test cases per story, shown as an editable plan tree `[ST-003, TD-002, GU-004]`. She merges
two stories, rewrites one criterion, deletes a gold-plated extra, and approves. The plan passes
its gate (every story traces to a requirement, every story has tests) `[VG-006, TR-002]`.

She sets the autonomy dial to `cruise` and clicks **Build** `[BD-004]`. The scheduler starts
three streams in parallel — isolated worktrees she never has to know about — respecting the
dependency order `[BD-002, BD-007]`. Her screen shows each stream in product terms: what story,
what's done, tests green or red `[BD-010, PS-008]`. One stream pauses with a question — "Should
sync conflicts favor the newest edit or ask the user?" — rendered as a decision card; she answers;
the stream continues `[GU-005, BD-012]`.

A story finishes: gates green, tests written and passing. Because the dial is `cruise`, it waits
for her at acceptance `[BD-005, RV-002]`. She opens the story's **live preview** — the actual app
running from that stream — clicks through the inspection flow, checks the acceptance criteria
checklist (each criterion linked to its passing test), and accepts `[PV-002, RV-003, RV-004]`.
The work merges to trunk; the remaining streams rebase automatically `[IG-003, IG-007]`.

By evening the trunk preview runs the whole product `[PV-004]`. She clicks **Deploy** — the
template's deploy target is configured — and sends the staging link to her team `[DR-003]`.

### 7.2 The requirement changes mid-build (live change)

Two days in, Priya learns field engineers wear gloves — big touch targets, voice notes. She edits
the affected requirement and adds one more `[RQ-007, CH-002]`. The system computes impact before
anything happens: two completed stories are affected, one in-flight stream is building against
the old text, four test cases need revision `[CH-003, TR-005]`. It proposes a re-plan as a
change-set — one revised story, one new story, updated test cases, and a redirect for the
in-flight stream — which she reviews as cards and approves `[CH-004, CH-005, GU-004]`. The
change itself is recorded as an artifact: what changed, why, what it touched `[CH-006]`. The
in-flight stream receives the revision as a new instruction in its session, visibly acknowledged
`[CH-007, BD-012]`. Nothing about this was an exception; it is the same plan → gate → build →
accept loop, entered from the middle.

### 7.3 Arjun adopts an existing codebase (brownfield, both modes)

Arjun, an architect, points iBuildOS at his company's existing repo `[PS-005, BF-002]`. An agent
reads the codebase and proposes a project contract (how to run dev, test, lint) which he corrects
`[TP-006, BF-003]`. He runs adoption: the agent drafts a requirements-and-stories backfill from
the code, routes, and tests — presented as a reviewable proposal set with confidence notes, which
he prunes and approves in batches `[BF-004, BF-005]`. Validation initially reports hundreds of
findings; he records the baseline, so the gate holds only new work to the standard while the debt
burns down visibly `[BF-006, VG-008, IN-006]`. From then on the repo behaves like any iBuildOS
project — his PM colleague works Product mode against it the same afternoon `[BF-008]`.

### 7.4 A small team, one repo (git-mediated collaboration)

Priya and Arjun each run the desktop app on their own machines against the same GitHub repo
`[TM-002, GH-003]`. Assignments, review requests, and statuses are artifacts in the repo, so
syncing the repo syncs the team state `[TM-003, TM-004]`. Arjun's app, on fetch, tells him two
acceptances await him and one stream hit a red gate overnight `[TM-005, PS-009]`. Streams they
run on their own machines publish work as branches/PRs on the remote; the merge gate is enforced
identically for both, and CI re-runs the same validation via the headless CLI `[IG-005, GH-005,
VG-010]`. No server of ours exists anywhere in this story `[NFR-002]`.

---

## 8. Conceptual architecture

Layers, not delivery phases. Each is replaceable without forking the others.

- **Desktop shell.** Native app hosting the UI; manages projects, windows, notifications,
  credentials (OS keychain), and lifecycle of local processes (core, previews, agents).
- **Core engine (local).** The re-implemented foundation: OKF store (parse/edit/write),
  type-profile registry, deterministic validation & gates, traceability graph, scheduler and
  stream manager (worktrees, branches, merges), project contract runner (dev/test/lint/deploy
  commands), and the event bus the UI subscribes to. Exposed to the UI in-process or over a
  local-only API; exposed to CI as the headless CLI.
- **ACP layer.** Spawns/connects agent processes, negotiates capabilities, manages sessions
  (one per stream or conversation), streams updates, brokers permission requests against the
  autonomy/permission policy, serves client-side file-system and terminal methods scoped to the
  stream's worktree.
- **Generative UI layer.** Translates the agent conversation into structured components and
  user responses back into prompt turns; carries UI context (current entity, mode) into sessions.
- **Repository (the record).** Git repo: code + OKF knowledge base + type profile + project
  contract + baselines. The only durable store. The git remote is the only multi-machine channel.
- **Preview runtimes.** Per-stream and trunk dev-server processes launched via the project
  contract, surfaced as embedded or external previews.

**Trust boundaries.** The file-system and terminal services iBuildOS serves to agents over ACP
are **enforced** to the stream's worktree; the trunk working copy is never an agent workspace.
For access an agent process makes natively through the OS, scoping is **directed** (working
directory, policy, instruction) and **audited** (run records), not physically enforced unless
OS-level sandboxing is enabled (NFR-007) — the spec states this honestly rather than claiming
an enforcement the mechanisms cannot deliver. Repo-declared contract commands run only after
explicit user trust confirmation (TP-008), and stream-triggered runs use trunk-resolved commands
with least-privilege environments. Secrets live in the OS keychain, reach processes only by
injection, and are redacted from transcripts and captured logs (AC-013); they are never written
to the repo. Nothing leaves the machine except: agent traffic (to the agent's own backend, under
the agent's own auth), git sync to the user's remote, explicit deploy commands, and opted-in
notification/report deliveries (TM-008, IN-004).

---

## 9. Functional requirements

Each area opens with a scope note. Requirements are mandatory (*shall*) unless marked otherwise.
"Done when" clauses give a concrete acceptance signal where the bar might otherwise be vague.

### A. Product Shell & Projects — `PS`

*Scope: the desktop application itself — projects, modes, navigation, notifications, settings.*

- **PS-001 — Desktop application.** iBuildOS shall ship as an installable desktop application for
  macOS, Windows, and Linux, launched without a terminal. *Done when:* a user with no developer
  tooling installed (beyond git and an ACP agent) can install, open, and create a project.
- **PS-002 — Multi-project home.** The app shall manage any number of projects, each bound to a
  local git repository, with a home surface listing projects and their live state (active streams,
  pending approvals, gate status).
- **PS-003 — Dual modes as peers.** Every project shall offer Product mode and Engineering mode
  as first-class, instantly switchable projections of the same underlying model. No workflow shall
  exist in only one mode's vocabulary without an equivalent (possibly summarized) in the other.
- **PS-004 — Guided project creation (greenfield).** Creating a project shall offer: name →
  template choice (TP) → agent connection (AC) → scaffold + initial commit — producing a valid,
  buildable project without any file or git operation performed by the user.
- **PS-005 — Open existing repository (brownfield).** The app shall open any existing git
  repository as a project and route the user into adoption (area BF).
- **PS-006 — Mode-appropriate vocabulary.** Product mode shall not require the user to encounter
  git concepts (branch, merge, commit, worktree, diff) to complete any Product-mode workflow;
  Engineering mode shall expose them fully. *Done when:* every Product-mode screen passes a
  vocabulary review against a maintained glossary.
- **PS-007 — Cross-mode deep links.** Any summarized entity in Product mode shall deep-link to
  its full technical representation in Engineering mode (acceptance card → diff; stream card →
  worktree/branch; requirement → raw OKF file), and back.
- **PS-008 — Live activity surface.** The app shall show, per project, everything currently in
  motion — streams, previews, gate evaluations, pending questions/approvals — updating live
  without manual refresh.
- **PS-009 — Notifications & attention queue.** The app shall aggregate everything awaiting the
  current user (approvals, acceptances, questions from agents, review requests, red gates) into
  one attention queue, surfaced via OS notifications (configurable) and in-app.
- **PS-010 — Command palette & search.** A global palette shall reach every screen, entity, and
  action; full-text search shall cover all knowledge-base artifacts in the project.
- **PS-011 — Onboarding.** First-run shall include a guided path (connect agent → create or open
  project → first requirement → first build) and a maintained in-app manual; both mode-aware.
- **PS-012 — Settings hierarchy.** Configuration shall resolve app-level → project-level →
  run-level, with project-level configuration stored in the repo (shareable) and machine/user
  secrets stored outside it (OS keychain).
- **PS-013 — Offline behavior.** With no network, everything except agent sessions, remote sync,
  and deploys shall work: browsing, editing artifacts, validation, gates, previews of local code.
- **PS-014 — Stable project identity & machine-local state.** *(1.1, G-33)* Each project shall
  carry a stable identity in repo config that survives folder moves, renames, and fresh clones;
  machine-local state (secret values, agent connections, transcripts) shall be keyed to it. On
  opening a moved or freshly cloned project, the app shall present a checklist of machine-local
  state to re-establish (missing secret values per PV-005 names, agent auth) before dependent
  operations fail.
- **PS-015 — Generated project onboarding.** *(1.1, lineage HS-007)* The app shall generate and
  maintain a project-specific onboarding artifact — this repo's layout, the active profile's
  workflow and statuses, the contract's commands, and how to make a first reviewed change —
  regenerated (or flagged stale) when profile or contract change, so a new human contributor
  orients from the repo itself.

### B. Requirements Studio — `RQ`

*Scope: capturing what to build — by hand or with AI — as structured, versioned OKF requirements.*

- **RQ-001 — Requirements as OKF artifacts.** Every requirement shall be an OKF document (markdown
  + YAML frontmatter) in the repo with a required `type`, stable human-readable ID, title, owner,
  status, and body. *Done when:* a requirement authored in the UI is readable and meaningful as a
  plain file on GitHub.
- **RQ-002 — Guided form authoring.** The UI shall offer template-backed, profile-driven forms for
  creating and editing requirements — fields, statuses, and validation generated from the type
  profile, validated inline before save.
- **RQ-003 — Free-form capture.** The UI shall accept unstructured input — a paragraph, a pasted
  document, a voice-note transcript, an image/mockup attachment — and hold it as draft material
  from which structured requirements are derived (by hand or via RQ-006).
- **RQ-004 — Requirement hierarchy.** Support a product brief (vision) refined into functional and
  non-functional requirements, with `traces_to` links; hierarchy depth is profile-configurable.
- **RQ-005 — Acceptance criteria.** Requirements shall carry testable acceptance criteria as
  structured list items addressable by ID, so stories, test cases, and acceptance checklists can
  reference individual criteria.
- **RQ-006 — AI requirements interview.** The user shall be able to develop requirements
  conversationally: an ACP agent interviews them (clarifying questions via generative UI),
  proposes structured requirements incrementally, and revises on feedback — with the accumulating
  artifacts always visible and directly editable beside the conversation.
- **RQ-007 — Edit anytime.** Requirements shall be editable at any lifecycle moment, including
  during builds; edits during builds route through Live Change Management (area CH).
- **RQ-008 — Requirement lifecycle.** Requirements shall carry a profile-defined status lifecycle
  (default: `draft → ready → building → built → verified → retired`), with transitions recorded
  and gate-checked where the profile says so. *(1.1, G-14)* The post-`ready` states shall be
  **derived automatically** from implementing work: any story queued/building → `building`; all
  implementing stories done → `built`; verifying tests passing → `verified`. No human or agent
  hand-maintains them, and gates that require a "ready" requirement accept `ready` or any later
  non-retired state (VG-006, PL-007).
- **RQ-009 — Readiness gate.** Marking requirements ready for breakdown shall evaluate a gate
  (complete fields, acceptance criteria present, no contradictory links); failures block with
  actionable messages.
- **RQ-010 — Structured requirement forms.** Requirement bodies may use EARS-style statements or
  Gherkin scenarios; the profile may enforce a house style per type.
- **RQ-011 — Attachments & references.** Requirements shall support attached files (mockups,
  screenshots, documents) stored in-repo and typed external references (URLs, incumbent-tracker
  IDs) without importing the external system.
- **RQ-012 — AI review of requirements.** On demand, an agent shall review the requirement set
  for ambiguity, contradiction, duplication, and missing cases, reporting findings as advisory
  cards linked to the artifacts they concern (never auto-editing them).
- **RQ-013 — Provenance.** Every requirement shall record how it came to be (human-authored,
  agent-drafted-human-approved, imported, backfilled) in frontmatter, so trust decisions can be
  made later.
- **RQ-014 — Design direction.** *(1.1, G-31)* Projects may carry design-direction artifacts —
  styleguide, brand, key screens/mockups, tone — that are **project-level session context**:
  injected into every implementer stream (AC-010, like house rules EX-006), not only streams
  linked to one requirement, so parallel stories share one visual language. Templates ship a
  starter; breakdown (ST-003) links stories to the design artifacts they must honor; acceptance
  (RV-003) shows them beside the preview. Also serves the Persona artifacts the interview
  elicits (§11).

### C. Stories & Tasks — `ST`

*Scope: converting requirements into workable, buildable units.*

- **ST-001 — Stories as OKF artifacts.** Stories shall be first-class artifacts with ID, title,
  owner, status, estimate (optional), acceptance criteria, and an `implements` link to at least
  one requirement (direct or via an optional epic grouping).
- **ST-002 — Tasks under stories.** Stories may decompose into tasks — the unit an agent executes —
  each with a `parent` story, status, and (once built) `code` references to the files it produced.
- **ST-003 — AI breakdown.** From selected requirements, an agent shall propose a complete
  breakdown — epics (optional), stories with acceptance criteria mapped from requirement criteria,
  tasks, dependencies, and test cases (area TD) — rendered as an editable plan tree, applied only
  on approval.
- **ST-004 — Manual breakdown parity.** Everything the AI breakdown produces shall be creatable
  and editable by hand in the UI with the same forms and validation — AI assistance is an
  accelerant, never a requirement.
- **ST-005 — Dependencies.** Stories and tasks shall support `depends_on` links with cycle
  detection; dependencies drive the parallel scheduler (BD-007) and are visualized in planning
  views. *Done when:* the scheduler provably never starts a stream whose unmet dependency is
  still open.
- **ST-006 — Story quality checks.** The readiness gate for stories shall check INVEST-style
  properties expressible deterministically (has criteria, sized within a profile-set bound,
  traceable, dependency-consistent); an agent review may add advisory judgment on the rest.
- **ST-007 — Story lifecycle.** Profile-defined statuses (default: `draft → ready → queued →
  building → review → accepted → done`, plus `rejected` and `retired`), transitions gate-checked;
  `done` shall additionally require merged code and passing verifying tests (VG-007). *(1.1,
  G-13)* The default profile shall include the backward and exit transitions the workflows
  require: `review → building` (request changes, RV-003), `review → rejected` (with stream
  disposition per BD-013), `accepted/done → review` (re-verification after a change, CH-005),
  and `any → retired` (re-plans, CH-004). Under `auto`, the `accepted` transition is recorded as
  dial-waived (BD-004/D-115).
- **ST-008 — Re-breakdown.** Breakdown shall be re-runnable against changed requirements,
  producing a diff-style proposal (add/modify/retire stories) rather than a fresh flat list —
  the mechanism Live Change Management (CH-004) uses.
- **ST-009 — Bugs as work.** Bugs shall be first-class artifacts (reproduction, severity,
  `affects` links) that enter the same breakdown → build → verify loop, with a regression test
  required before the fix's merge gate passes.

### D. Test Design — `TD`

*Scope: designing effective verification before and during the build.*

- **TD-001 — Test cases as OKF artifacts.** Test cases (manual and automated) shall be first-class
  artifacts with ID, kind, status, and `verifies` links to requirements, stories, or individual
  acceptance criteria.
- **TD-002 — Tests designed with the breakdown.** Story breakdown (ST-003) shall include proposed
  test cases per story — derived from acceptance criteria — so verification is designed before
  code exists.
- **TD-003 — Automated-test binding.** An automated test case shall reference its implementation
  (test file/identifier pattern); the binding is validated against the working tree, and execution
  results attach to the artifact (TX-004).
- **TD-004 — Manual test scripts.** Manual test cases shall carry executable-by-a-human steps and
  expected results; the UI shall guide a manual run step-by-step and record the outcome (TX-005).
- **TD-005 — Unit-test policy.** The project shall declare a unit-test expectation (default: every
  task that changes code ships/updates unit tests alongside); agents receive it as instruction,
  and the stream-done gate enforces the deterministic part (test files present for changed code
  areas, suite passing).
- **TD-006 — Coverage by traceability.** The system shall report which requirements, stories, and
  acceptance criteria have (passing) verifying tests and which do not — coverage measured by the
  traceability graph, not only by code-coverage tooling.
- **TD-007 — AI test authoring.** On demand, an agent shall draft or strengthen test cases
  (including edge and failure cases) from requirements/stories, as proposals; TD artifacts remain
  human-editable like all others.
- **TD-008 — Test evolution with change.** When requirements change, impact analysis (CH-003)
  shall include affected test cases; re-plans include their revision.
- **TD-009 — Test suites & plans.** *(1.1, G-25 / lineage TT-007)* Test cases shall be groupable
  into named suites (release regression, smoke, feature pass) as artifacts linkable to releases
  and milestones; suite membership is a typed link, and suite execution is a first-class tracked
  run (TX-008) whose aggregate result feeds release readiness (DR-002).

### E. Planning & Sequencing — `PL`

*Scope: arranging work in time and priority — the product person's planning surface.*

- **PL-001 — Backlog & board.** Stories/tasks shall be arrangeable in a prioritized backlog and a
  status board (columns derived from the profile's status vocabulary); both are views over
  artifacts, and reordering/moving writes artifact fields.
- **PL-002 — Releases & milestones.** Support release and milestone artifacts that group stories
  (`planned_for`), with readiness computed from gates and traceability (DR-002).
- **PL-003 — Iterations (optional).** Sprint/iteration artifacts may group work in time; teams
  that don't use them see nothing about them (profile-toggled).
- **PL-004 — Dependency view.** Planning shall visualize the dependency graph (ST-005) and
  surface the current parallelization frontier — what can build now vs what is blocked and why.
- **PL-005 — Estimates & rollups.** Optional estimates on stories/tasks roll up to requirements,
  releases, and milestones.
- **PL-006 — Priority is data.** Priority/value metadata lives on artifacts (profile-defined
  fields); no specific prioritization framework is imposed.
- **PL-007 — Plan gate.** Queueing work for build shall evaluate the plan gate: every queued story
  traces to a requirement in `ready` or a later non-retired state *(1.1, G-14)*, has acceptance
  criteria and test cases, and has a consistent dependency closure.

### F. Build Orchestration — `BD`

*Scope: the parallel engine — turning queued stories into built software through agent streams.*

- **BD-001 — Stream model.** A stream shall bind: one isolated git worktree on its own branch +
  one ACP agent session + one assignment (a story, or a coherent task set). Streams are the only
  place agents do repository work.
- **BD-002 — Parallel by default.** The scheduler shall run multiple streams concurrently
  (bounded by a configurable limit), assigning queued, unblocked work in priority order. *Done
  when:* two independent stories demonstrably build simultaneously on one machine with isolated
  file effects.
- **BD-003 — Worktree isolation.** Each stream's file-system and terminal access (served over
  ACP) shall be scoped to its worktree; the trunk checkout is never an agent workspace; streams
  shall not see each other's uncommitted state.
- **BD-004 — Autonomy dial.** *(amended 1.1, G-11/D-115)* A per-project default, overridable per
  run, shall govern which green gates and approval points auto-advance:
  - `step` — every stage transition and approval point awaits an explicit human action.
  - `cruise` — green gates auto-advance; execution stops at **decision points**, story
    **acceptance** (RV-003), and **merge** (IG-003).
  - `auto` — green merges and story acceptances proceed without waiting; each waived acceptance/
    merge approval is recorded as **dial-waived** on the run record (satisfying RV-007 and the
    `accepted` transition of ST-007) and is queued in the attention surface (PS-009) for
    after-the-fact review.

  **Decision points** stop execution at every level: agent questions (BD-012), breakdown and
  change-set approvals (ST-003, CH-004), and secret requests (AC-013). **Red gates always stop**
  regardless of dial. Per-gate overrides of these defaults are profile data (EX-004).
- **BD-005 — Staged pipeline.** Each stream shall progress through profile-defined stages
  (default: `implement → self-verify → done`) with a deterministic gate between stages; the
  stream-done gate requires: validation clean, bound tests passing, unit-test policy satisfied,
  task/story artifacts updated (statuses, `code` refs).
- **BD-006 — Task loop.** Within a stream, the agent shall work task-by-task with per-task commits
  in the stream branch, so progress is inspectable and resumable at task granularity.
- **BD-007 — Dependency-aware scheduling.** The scheduler shall not start work whose `depends_on`
  closure is unmerged, and should avoid co-scheduling stories it can predict will collide (shared
  `code` refs/paths), reducing merge conflicts before they exist.
- **BD-008 — Steer mid-flight.** The user shall be able to send instructions into any running
  stream's session ("use the existing date utils", "stop gold-plating"), visible in the transcript,
  without restarting the stream.
- **BD-009 — Pause, resume, abort.** Streams shall be pausable (session interrupted via
  `session/cancel`, worktree kept), resumable (session resumed or re-established with context),
  and abortable (worktree/branch disposed or kept for inspection — user's choice).
- **BD-010 — Live stream visibility.** Each stream shall stream its activity live: Product mode
  shows story, stage, progress, test state, and current summarized action; Engineering mode adds
  the full transcript, tool calls, file changes, and per-task commits.
- **BD-011 — Run records.** Every agent execution shall persist a run artifact: assignment,
  agent identity, started/ended, outcome, gate results, and a transcript reference — the audit
  trail for "who did what, driven by whom."
- **BD-012 — Agent questions as first-class events.** When an agent needs a decision, the stream
  shall enter a waiting state, surface the question through generative UI (GU-005) and the
  attention queue (PS-009), and resume on answer — including questions raised by Live Change
  redirects (CH-007).
- **BD-013 — Failure handling.** A stream whose gate goes red, whose agent fails, **or whose work
  is rejected at review** *(1.1, G-13)* shall stop in an inspectable state (worktree preserved,
  findings/review notes attached), offer one-click remediation paths (retry task, send
  instruction, open in Engineering mode, abort), and never silently discard work.
- **BD-014 — Crash safety.** The repo (branches, commits, artifacts) shall be the durable record;
  after an app or machine crash, streams shall be recoverable to their last committed task, and
  the scheduler shall re-attach or cleanly restart sessions.
- **BD-015 — Resource limits.** Concurrency, per-stream timeouts, and (where the agent reports
  them) usage/cost signals shall be configurable and visible, so a runaway build is boring to
  stop, not exciting to discover.
- **BD-016 — Throttling is backpressure, not failure.** *(1.1, G-35)* Provider rate limiting and
  transient agent errors (as surfaced via ACP or agent exit behavior) shall pause the affected
  streams with automatic retry and backoff, temporarily reduce global concurrency, and surface as
  **one aggregate notice** — not per-stream red failures. Only sustained failure past a
  configurable retry budget escalates to BD-013. An overnight `auto` run must survive a rate
  limit, not die of it.
- **BD-017 — Stream claims & cross-machine supersession.** *(1.1, G-03)* The scheduler shall
  auto-start only work assigned to, or claimed by, the local user (TM-003). Starting a stream
  writes a claim (user, machine, timestamp) to the story artifact, shared via sync (GH-003). On
  fetch, a stream whose story has been claimed elsewhere or already merged shall pause with a
  supersession notice offering abort or rebase-as-diff; the merge gate shall fail a stream whose
  story is already `done` on trunk.

### G. Integration, Merge & Conflicts — `IG`

*Scope: how stream work reaches the trunk — gates, merge order, conflict resolution.*

- **IG-001 — Trunk protection.** Work shall reach the trunk only through the merge gate:
  validation clean (relative to baseline), verifying tests passing, story acceptance satisfied
  (per dial), and traceability chain intact for the merged scope. No actor — human or agent —
  shall bypass it through the app.
- **IG-002 — Merge queue.** Completed streams shall enter an ordered merge queue; each merge
  re-evaluates against the current trunk (not the trunk the stream started from) before landing.
- **IG-003 — Auto-integration on green.** When a merge is conflict-free and gates are green, the
  app shall merge per the dial (`auto`: land it; otherwise: one-click for the approver), commit
  with full attribution, and update artifact statuses atomically with the merge.
- **IG-004 — Agent conflict resolution at merge time.** When a merge conflicts, an agent session
  shall be started in a dedicated integration worktree to resolve it — honoring both sides'
  stories and tests — and the resolution shall be presented as a reviewable change (summary +
  diff + re-run gate results) for human approval per the dial. (Decision D-109.)
- **IG-005 — Remote/PR pathway.** Per project policy, streams may publish branches and open pull
  requests on the remote instead of (or before) local merging — mapping stream → branch → PR —
  so teams keep their existing review infrastructure; gates still evaluate locally and in CI.
- **IG-006 — Manual resolution path.** Engineering mode shall always allow taking over a conflict
  manually (open worktree in external editor/terminal); the merge gate applies identically after.
- **IG-007 — Post-merge reconciliation.** After each trunk advance, in-flight streams shall be
  rebased/updated per policy (auto-rebase when clean; agent-assisted when conflicted; notify
  always), so streams drift from trunk by hours, not days.
- **IG-008 — Incremental merges.** Long streams should be mergeable at task granularity when
  gates allow (stacked, reviewable increments), rather than only as one final drop.
- **IG-009 — Atomic knowledge+code.** A merge shall carry the stream's code and its artifact
  updates (statuses, links, run records) in the same landing, so trunk history never shows code
  without its knowledge or knowledge without its code.
- **IG-010 — Trunk-broken state.** *(1.1, G-10)* When trunk fails gates after an out-of-app
  advance (e.g., a direct terminal push), the app shall enter a defined trunk-broken state: the
  merge queue holds, auto-rebase (IG-007) pauses, affected users are notified (TM-005), and a
  remediation flow is offered — an agent fix-forward stream, or an explicit, recorded one-time
  quarantine of the offending findings (distinct from the baseline, which never absorbs
  regressions). Recovery actions are recorded like any run.
- **IG-011 — Ordered-resource serialization.** *(1.1, G-02)* Work the plan marks as touching
  ordered resources (database migrations, sequenced codegen — declared via the contract, TP-004)
  shall be serialized through the merge queue rather than merged concurrently; where the contract
  declares a `migrate` command, the merge gate shall re-run migrate + tests from a clean state on
  the merge result before landing.

### H. ACP Agent Integration — `AC`

*Scope: the only door between iBuildOS and AI — the Agent Client Protocol.*

- **AC-001 — ACP as the sole agent interface.** All AI capability — requirements interviewing,
  breakdown, coding, test authoring, conflict resolution, reviews, digests — shall be delivered
  through ACP agent sessions. No bundled model, no direct LLM API path in the product. (Decision
  D-110.)
- **AC-002 — Agent registry.** The app shall maintain a registry of configured agents: built-in
  definitions for known ACP agents (e.g., Claude Code, Gemini CLI, Codex, Goose — via native
  support or adapters) plus user-defined entries (launch command, args, env). Adding an agent
  shall not require an app update.
- **AC-003 — Capability negotiation.** The app shall `initialize` each agent, record negotiated
  capabilities (loadSession, fs, terminal, modes, …), and degrade gracefully — features that need
  a missing capability are hidden or explained, never broken.
- **AC-004 — Session management.** The app shall manage sessions per stream/conversation
  (`session/new`, `session/load` where supported), stream `session/update` notifications
  (message chunks, thoughts, tool calls, plans) into the UI live, and support `session/cancel`.
- **AC-005 — Agent-owned auth.** Authentication shall belong to the agent (its own login/
  subscription/keys), brokered through ACP's authenticate flow where offered; iBuildOS shall not
  proxy, store, or require model credentials of its own.
- **AC-006 — Permission policy.** Agent `session/request_permission` calls shall resolve against
  a policy derived from the autonomy dial and project settings: in-worktree file edits and
  declared-safe commands auto-approved; escalations (outside workspace, network, destructive,
  deploy) prompt the user with clear scope. Every grant is logged (BD-011).
- **AC-007 — Scoped client services.** The app shall serve ACP client methods — file system
  (`fs/read_text_file`, `fs/write_text_file`) and terminal (`terminal/create` …) — scoped to the
  session's worktree and project contract; paths outside scope are refused.
- **AC-008 — Role-based agent assignment.** Projects shall be able to assign different agents (or
  different modes of one agent) to roles — interviewer, planner, implementer, test author,
  resolver, reviewer — with per-role defaults and per-run overrides.
- **AC-009 — MCP passthrough.** Project-configured MCP servers (design systems, data sources,
  browsers) shall be passed to agent sessions where the agent supports MCP configuration, so
  agents inherit project tooling without per-agent setup.
- **AC-010 — Context injection.** Every session shall start with the relevant, current context —
  the assignment's artifacts, linked requirements/criteria, project contract, house rules
  (EX-006) — assembled by the app so outcomes don't depend on the agent's file spelunking.
- **AC-011 — Agent health & fallback.** The app shall preflight agents (installed? authenticates?
  responds?), surface health in settings, and allow switching an assignment's agent mid-project
  without losing artifacts (sessions restart; the repo is the state).
- **AC-012 — Transcript persistence.** *(amended 1.1, G-07)* Session transcripts shall be
  persisted **machine-local** (in app storage or a gitignored project directory) — never
  committed to the repo. Run records (in-repo, BD-011) shall carry a machine-scoped transcript
  reference plus an in-repo summary sufficient for cross-machine audit (NFR-008); a dangling
  transcript reference on another machine is a defined, tolerated state. Known secret values
  (PV-005) shall be redacted from transcripts and captured logs before persistence. Product mode
  shows summaries, Engineering mode the full stream.
- **AC-013 — Secret requests are not conversation.** *(1.1, G-08)* An agent's declared need for a
  named credential shall surface as a **secret-request event**, distinct from decision cards: the
  user supplies the value directly into the keychain (PV-005) — never through chat, cards, or
  prompt turns — and the stream resumes with the variable injected. Secret values shall be
  redacted from transcripts, run records, and component answers; whether a given variable is
  injected into agent terminal sessions (vs only user-initiated preview/deploy) is per-variable
  policy, visible in the permission log (AC-006).

### I. Chat & Generative UI — `GU`

*Scope: making interaction effective — conversation with structure, everywhere.*

- **GU-001 — Chat anywhere, in context.** A conversation surface shall be available across the
  app, automatically carrying the current context (project, entity in view, mode) into the
  session, so "tighten this requirement" needs no explanation of "this."
- **GU-002 — Structured components over prose.** Agent interactions shall render as typed,
  interactive components — the generative UI catalog — with prose as the fallback, not the default.
- **GU-003 — Component: clarifying-question forms.** Agent questions shall render as answerable
  forms (single/multi choice, short text, ranked options) whose answers return to the session as
  structured turns. (The requirements interview, RQ-006, is built from these.)
- **GU-004 — Component: plan & change-set cards.** Proposed breakdowns, re-plans, and multi-
  artifact edits shall render as reviewable trees/cards with per-item accept/edit/reject, applied
  transactionally on approval.
- **GU-005 — Component: decision cards.** Mid-build questions (BD-012) shall render as decision
  cards stating the question, the options with consequences, and the agent's recommendation;
  answers are recorded on the run record — **except credentials, which must route through
  secret-request events (AC-013), never through cards** *(1.1, G-08)*.
- **GU-006 — Component: progress & summary cards.** Long-running work shall render as live
  progress components (stages, tasks, gates) fed by ACP plan/tool-call updates — legible in
  Product mode without reading logs.
- **GU-007 — Component: review summaries.** Completed work shall render as acceptance-oriented
  summaries — what was built, criteria satisfied (with test evidence), notable decisions, known
  limits — generated by the agent, linked to the underlying diff for Engineering mode.
- **GU-008 — Components deep-link.** Every entity referenced in a component (requirement, story,
  test, file, stream) shall deep-link to its canonical UI location (PS-007).
- **GU-009 — Extensible component catalog.** The component catalog shall be extensible
  (versioned schemas); unknown component types degrade to a readable generic rendering, so agent
  and app can evolve independently.
- **GU-010 — Protocol posture.** The generative UI layer should track and, where practical, adopt
  open agent-UI event protocols (e.g., AG-UI) rather than inventing a private dialect; the
  concrete protocol choice is a tech-stack decision, but the design shall not preclude adoption.
- **GU-011 — Voice & paste-in inputs.** Conversation surfaces should accept dictated audio
  (transcribed) and pasted rich content (documents, images) as first-class inputs (feeding RQ-003).
- **GU-012 — Component emission over ACP.** *(1.1, G-42)* Since ACP standardizes message chunks,
  thoughts, tool calls, plans, and permission requests — but not UI components — the platform
  shall define and publish a **component-emission convention** carrying typed GU components as
  structured payloads within `session/update` content (tool-call or extension payloads), which
  role instructions (AC-010) teach agents to use. Agents/adapters that don't emit it degrade to
  the prose fallback (GU-002); the convention is versioned with the component catalog (GU-009)
  and is part of the bridge contract (tech stack T-004).

### J. Knowledge Base & Type Profiles — `KB`

*Scope: the storage substrate and the self-describing schema. (Foundation carried from prior
rounds, re-specified for this product.)*

- **KB-001 — Single source of truth.** All project knowledge — brief, requirements, stories,
  tasks, tests, changes, decisions, runs, releases, team — and the code shall live in one git
  repository; no companion database shall be required to operate.
- **KB-002 — OKF-conformant storage.** Every knowledge artifact shall be an OKF concept: UTF-8
  markdown + YAML frontmatter with a non-empty `type`, in a configured bundle location; a stock
  OKF consumer can read the bundle without translation. *(1.2, D-116)* Target is **OKF v0.2**:
  workflow lifecycle uses the `state` key (OKF reserves `status`), and provenance maps onto
  OKF's `generated`/`sources` fields — serialization normative in FORMATS.md §1.
- **KB-003 — Types are data.** Every artifact type shall be defined as an OKF document (fields,
  required-ness, enums/patterns, typed relationships with target type + cardinality, statuses,
  transitions); the app hardcodes only the meta-type.
- **KB-004 — Profile inheritance & extension.** Type definitions shall support `extends` and
  abstract bases; projects extend, override, or replace the shipped default profile (§11); a
  `json_schema` escape hatch covers what the friendly dialect cannot express.
- **KB-005 — UI generated from profile.** Forms (RQ-002), board columns (PL-001), status colors,
  lifecycle actions, and gate wiring shall derive from the profile at runtime — a profile edit
  changes the product's behavior with zero app changes. *Done when:* renaming a status or adding
  a field appears in the UI without an app update.
- **KB-006 — Meta-validation.** Profiles shall themselves be validated (unknown `extends`,
  bad relationship targets, unreachable statuses) with actionable errors.
- **KB-007 — Deterministic file conventions.** Artifacts shall use stable slug/ID-based file
  naming, UTF-8, LF, and deterministic serialization so edits diff cleanly and IDs survive moves.
- **KB-008 — Graceful degradation.** Removing iBuildOS shall leave a fully usable markdown + code
  repo; unknown types and fields shall be tolerated (warn, never reject) per OKF permissiveness.
- **KB-009 — Profile versioning & sharing.** Profiles shall be versioned, and publishable/
  importable across projects (an organization's house process as a forkable artifact set).
- **KB-010 — Concurrency-safe artifact IDs.** *(1.1, G-01)* Artifact ID allocation shall be
  collision-free under concurrent creation with no coordination: streams mint **stream-scoped
  provisional IDs**, and the merge queue — the single allocator per trunk landing — finalizes
  them, renumbering collisions and rewriting inbound links atomically with the landing (IG-009).
  Duplicate final IDs are a merge-gate **error** rule; VG link resolution treats provisional and
  final IDs consistently within a stream.
- **KB-011 — Profile evolution & migration.** *(1.1, G-18 / lineage GV-003)* A profile version
  bump shall ship a migration/compatibility statement; profile upgrades (including updates to the
  app-shipped default profile) are offered as ordinary reviewable change-sets — mirroring
  template evolution (TP-007) — and artifacts are validated against the project's recorded
  profile version (VG-012), never silently re-interpreted under new rules.

### K. Validation & Gates — `VG`

*Scope: the deterministic authority — structure checked fast, offline, without AI.*

- **VG-001 — Deterministic engine.** A validation engine shall check the knowledge base with no
  AI and no network — purely profile + files: field/schema validity, link resolution (target
  exists, right type, cardinality), status legality, and chain completeness rules.
- **VG-002 — Fast enough to be ambient.** Validation shall be incremental and fast enough to run
  on every artifact save and every stream commit (target: thousands of artifacts in seconds,
  edits in milliseconds), powering live feedback rather than batch runs.
- **VG-003 — Findings are actionable.** Every finding shall carry file, location, rule, severity,
  message, and where possible a proposed fix; severities are per-rule configurable
  (error/warn/off).
- **VG-004 — Gates as named check bundles.** A gate shall be a named, profile-defined bundle of
  checks bound to a lifecycle point (requirement-ready, plan, stream-stage, stream-done, merge,
  release). The shipped defaults are listed per area; projects may redefine them.
- **VG-005 — Gates are the only authority.** Stage advancement, merges, and releases shall
  consult gate results computed by this engine; the autonomy dial chooses whether *green*
  advances automatically — nothing makes red advance.
- **VG-006 — Plan gate (default).** Queued story sets shall be checked for: traceability to
  requirements in `ready` or a later non-retired state *(1.1, G-14)*, acceptance criteria
  present, test cases present, dependency closure consistent.
- **VG-007 — Done means done (default).** A story/task shall reach `done` only with: merged code
  referenced by `code` links, verifying tests bound and passing, and chain intact — the single
  rule that keeps status honest.
- **VG-008 — Baseline & ratchet.** For brownfield repos, a committed baseline shall record
  accepted pre-existing findings (by rule + artifact + fingerprint); gates block only new/changed
  violations. *(amended 1.1, G-19)* The baseline only shrinks **within adopted scope**; expanding
  adoption scope (BF-005) may add baseline entries for the newly adopted paths, recorded as a
  **scope-expansion event** so burndown reporting (IN-006) distinguishes new scope from
  regression. Baseline fingerprints record the engine version that produced them (VG-012).
- **VG-009 — Docs & code lint orchestration.** The unified check shall include documentation
  conventions (required sections, broken links) and orchestrate the project's own code
  linters/formatters via the project contract — results folded into one report, tools never
  reinvented.
- **VG-010 — Headless CLI & CI parity.** A headless CLI shall run the identical engine
  (`validate`, `gate <name>`, `--format json`, exit codes) for CI and pre-commit use; a shipped
  CI recipe annotates findings on PRs, supports an **annotate-only (never-fail) mode** with a
  documented promotion path to blocking as the baseline shrinks *(1.1, lineage VL-014)*, and
  installs the repo-declared engine version (VG-012). *Done when:* UI and CI cannot disagree
  about the same commit evaluated at the same pinned engine version.
- **VG-011 — Simulation.** Before applying any multi-artifact proposal (breakdown, change-set,
  merge), the app shall pre-compute the resulting findings delta ("this change: −2 errors, +1
  warning") and show it with the approval.
- **VG-012 — Engine & profile version pinning.** *(1.1, G-17 / lineage D-008, VL-012)* The repo
  shall record the profile version and the required validation-engine version (or range) its
  gates are computed against. App and CLI shall warn — or refuse, per policy — when evaluating
  gates with a mismatched engine or profile version; gate results and baseline fingerprints
  record the producing engine version; the app shall not auto-advance gates evaluated under an
  engine version differing from the repo's pin.
- **VG-013 — Gate evidence model.** *(1.1, G-12)* A gate verdict combines (a) **deterministic
  checks** — bit-reproducible from files + profile + engine version, per NFR-005 — and (b)
  **recorded execution evidence**: test, lint, and (where enabled, GH-005) CI results captured
  against a specific commit and stored as artifacts (TX-004). Reproducibility means: same
  commit + profile + engine + recorded evidence → same verdict, everywhere. Evidence-consuming
  rules shall state staleness policy (how old evidence may be relative to the evaluated commit).

### L. Traceability & Impact — `TR`

*Scope: the connected chain and what it answers.*

- **TR-001 — The chain.** The system shall maintain and validate the chain: brief → requirement
  → (epic) → story → task → code → test → release, with bugs and changes attached where they
  occur.
- **TR-002 — Typed links, checked.** Every link shall resolve to an existing artifact of the
  correct type and cardinality (VG-001); orphans (requirement with no story, story with no test,
  code with no task, task with no code) are findings with per-rule severity.
- **TR-003 — Bidirectional navigation.** Every artifact view shall show what it traces to and
  what traces to it; navigation works both directions, in both modes.
- **TR-004 — Matrix & graph views.** The UI shall provide a requirements-traceability matrix and
  a navigable graph/chain view; both exportable (JSON) for external tools.
- **TR-005 — Impact queries.** Given a requirement edit, an artifact, or a set of changed files,
  the system shall answer "what does this touch?" — affected stories, tests, code, in-flight
  streams — deterministically from the graph (the engine under CH-003).
- **TR-006 — Release-scoped traceability.** Traceability shall be queryable per release/milestone
  ("is everything in this release built and verified?") feeding readiness (DR-002).
- **TR-007 — Code back-references.** From a source file, the system shall answer which tasks,
  stories, and requirements it serves (via `code` refs), surfacing it in Engineering mode and to
  agents (AC-010).

### M. Live Change Management — `CH`

*Scope: requirements that change while the product is being built — the loop, not an exception.*

- **CH-001 — Change is a workflow, not an edit war.** Modifying requirements after breakdown
  shall route through a change workflow that preserves history, computes impact, and re-plans —
  while staying as lightweight as the change warrants (a typo fix shall not demand ceremony;
  profile-defined significance rules decide).
- **CH-002 — Capture the change.** A significant requirement edit shall create/attach to a Change
  artifact recording: what changed (before/after), why (author's intent), and when — linked to
  the affected requirements.
- **CH-003 — Impact before action.** On change, the system shall compute and present impact from
  the graph (TR-005): affected stories (built, queued, in-flight), test cases, code areas, and
  releases — before anything is modified downstream.
- **CH-004 — Re-plan as a proposal.** The system (via the planner agent) shall propose the
  downstream reconciliation as one reviewable change-set (GU-004): stories to revise/add/retire,
  test cases to update, acceptance criteria remapped — applied transactionally on approval.
- **CH-005 — Built work re-verification.** Where a change affects already-built stories, the
  re-plan shall include verification work (revised tests, re-acceptance), so "built against the
  old requirement" is visible state, not silent rot.
- **CH-006 — Change history.** Changes shall be permanent artifacts; a requirement's view shall
  show its change history (with git as the underlying record), answering "why is this like this?"
- **CH-007 — In-flight redirection.** For streams building against changed artifacts, the app
  shall (per dial): pause and present options, or inject the revision into the session as an
  instruction with acknowledgment — never let a stream finish against a silently outdated spec.
- **CH-008 — Drift detection.** The system shall flag divergence it can detect deterministically
  (code referencing retired requirements, tests verifying superseded criteria, stories whose
  requirement moved) as findings; agent review (RQ-012) may add semantic drift on demand.
- **CH-009 — Undo as a change workflow.** *(1.1, G-20)* From any accepted/merged story, Product
  mode shall offer **"Remove / rework this"**: the system computes impact (TR-005), proposes a
  change-set (revert or removal stories, artifact status rollback so VG-007 stays honest, test
  retirement or replacement), and executes it through a normal stream and merge gate — recorded
  as a Change. Reverts performed outside the app are detected as drift (CH-008) with a guided
  reconciliation flow. This is how NFR-009's reversibility is actually delivered.
- **CH-010 — Implementation-conformance audit.** *(1.1, lineage GP-003)* On demand, an agent (the
  reviewer role, AC-008) shall audit built scope against its requirements and acceptance
  criteria — does the implementation actually do what the text says — reporting advisory
  findings linked to the story, requirement, and code concerned. Complements CH-008's
  deterministic drift with semantic conformance.

### N. Preview & Environments — `PV`

*Scope: seeing and touching the product being built — the product person's feedback loop.*

- **PV-001 — Preview via project contract.** The app shall launch the application under
  development using the project contract's dev command — per stream (from its worktree) and for
  the trunk — managing process lifecycle, ports, and logs.
- **PV-002 — Story preview for acceptance.** From any stream or completed story, one click shall
  open the running app built from that work — embedded pane for web targets, external launch
  otherwise — as the primary artifact of acceptance review (RV-003).
- **PV-003 — Preview freshness.** Previews shall track their source (hot-reload where the stack
  supports it, restart otherwise) and visibly state what they're running (story, branch, commit)
  so nobody accepts against a stale build.
- **PV-004 — Trunk preview.** The integrated product shall be one click away at all times,
  reflecting the current trunk.
- **PV-005 — Environment variables & secrets.** Projects shall define named environments
  (local, staging, …) with per-environment variables; secret values live in the OS keychain
  (never the repo — a committed-secret check is a default gate rule bound to the `stream-done`
  and `merge` gates, §11), injected at preview/test/deploy time; the repo stores variable
  *names* and non-secret defaults so the contract is shareable. Agents obtain missing secrets
  only via secret-request events (AC-013) *(1.1)*.
- **PV-006 — Seed data.** The project contract may declare a seed/reset command so previews and
  test runs start from meaningful data; templates ship one.
- **PV-007 — Preview diagnostics to agents.** Runtime errors and logs from previews shall be
  capturable and attachable to a bug or fed into a stream session ("here's the stack trace —
  fix it") without manual copy-paste. Captured diagnostics are machine-local and redacted like
  transcripts (AC-012) — never committed *(1.1, G-07)*.
- **PV-008 — Non-web preview surfaces.** *(1.1, G-29)* For targets without a browsable UI, the
  preview shall be a derived **interaction surface** where the contract/stack permits: an HTTP
  console generated from routes/OpenAPI for API services, a runner pane with captured output for
  CLIs. Where none is derivable, story acceptance (RV-003) explicitly presents test evidence and
  an agent-written walkthrough (worked example invocations) as the primary acceptance artifact,
  and the profile may require a product-language manual-run script (TD-004).
- **PV-009 — Preview data state.** *(1.1, G-02)* When a preview's source changes (trunk advance,
  stream update), declared `migrate`/`seed` steps shall re-run per policy, and the freshness
  display (PV-003) shall include data-state provenance (which migrations/seed applied) — so
  acceptance never happens unknowingly against stale schema or data.

### O. Test Execution & Quality — `TX`

*Scope: running verification and recording truth.*

- **TX-001 — Run tests from the UI.** Automated tests shall be runnable from the UI — per
  stream, per story (its bound tests), and full-suite on trunk — via the project contract's test
  command; iBuildOS orchestrates the project's own runner, never replaces it.
- **TX-002 — Tests in the loop.** Stream stages (BD-005) shall run bound tests automatically;
  results feed the stage/done gates without user action.
- **TX-003 — Watch & re-run.** Failed tests shall be re-runnable individually; Engineering mode
  may keep a watch loop per stream.
- **TX-004 — Results as artifacts.** Test outcomes (automated and manual) shall be recorded as
  OKF result artifacts (what ran, against which commit, verdict, evidence link), so verification
  history is versioned knowledge, not transient CI logs.
- **TX-005 — Guided manual runs.** Manual test cases (TD-004) shall execute as guided checklists
  in the UI, capturing per-step outcomes and evidence (screenshots/notes) into a result artifact.
- **TX-006 — Quality dashboard inputs.** Test and lint results shall feed coverage (TD-006),
  gates (VG), and insights (IN-002) from one source of record.
- **TX-007 — Flake awareness.** The system should track test stability across runs and flag
  flaky tests as findings, so a red gate means signal, not noise.
- **TX-008 — Suite execution.** *(1.1, G-25)* A test suite (TD-009) shall be runnable — and, for
  manual members, guided — as one tracked execution producing an aggregate result artifact
  (per-case outcomes, commit, environment), linkable to the release/milestone it exercised and
  consumed by readiness (DR-002).

### P. Review & Acceptance — `RV`

*Scope: how humans say yes — in product language and in engineering language.*

- **RV-001 — Two review surfaces, one gate.** Product-mode acceptance and Engineering-mode
  review shall be different lenses on the same underlying review object; either (or both, per
  policy) satisfies the human-approval part of the merge gate.
- **RV-002 — Acceptance queue.** Work awaiting acceptance shall appear in the attention queue
  (PS-009) with everything needed to decide in one place.
- **RV-003 — Product-mode acceptance.** Acceptance shall present: the story and its criteria as
  a checklist (each criterion with its verifying test's status), the agent's review summary
  (GU-007), the live preview (PV-002) — or, for non-web targets, the derived interaction surface
  or evidence-centric package (PV-008) *(1.1, G-29)* — and notable decisions/limits, no diff
  reading required. Accept, request changes (routes back to the stream with the note), or reject
  (stream disposition per BD-013).
- **RV-004 — Criteria-evidence binding.** Each acceptance-criterion check shall link to its
  evidence (passing test result, manual-run record, or explicit human waiver — waivers recorded).
- **RV-005 — Engineering-mode review.** Full technical review: per-file diffs, commits, findings
  delta, run transcript, with comment threads recorded as artifacts; integrates with the PR
  pathway (IG-005) when enabled.
- **RV-006 — Review requests.** Reviews/acceptances shall be assignable to specific users
  (TM-004); the assignment travels through the repo and lands in the assignee's attention queue.
- **RV-007 — Approvals are recorded.** Every approval/acceptance/waiver shall be recorded (who,
  what, when, against which commit) on the relevant artifact/run — the audit trail of human
  judgment, matching the audit trail of agent action (BD-011). *(1.1, D-115)* Under `auto`,
  waived acceptances/merge approvals are recorded as **dial-waived** (by whom the dial was set,
  when, against which commit) and queued for after-the-fact review (PS-009) — the audit trail
  never has holes, even hands-off.

### Q. Git & Remote Integration — `GH`

*Scope: the versioning substrate and the world outside the machine.*

- **GH-001 — Git-native, git-only.** All history, branching, attribution, and sync shall come
  from git; the app shall manage repos with standard git (no custom server, no bespoke
  metadata store).
- **GH-002 — Invisible where it should be.** The app shall perform all routine git operations
  (init, branch, worktree, commit, merge, fetch, push) itself; Product mode expresses them only
  as product events ("saved", "built", "shared").
- **GH-003 — Remote connect & sync.** Projects shall connect to any git remote (GitHub, GitLab,
  self-hosted, bare) with credential handling via the platform's standard mechanisms; sync
  (fetch/push) runs automatically per policy and manually on demand, with clear conflict
  surfacing (TM-006).
- **GH-004 — Attribution.** Commits shall correctly attribute the human (git identity) and the
  acting agent (structured co-author/trailer convention), so `git blame` answers "who and what
  wrote this."
- **GH-005 — Forge integration (optional).** Where a forge is connected, the app may open/track
  PRs for streams (IG-005), read CI status into gates, and link releases — degrading cleanly to
  pure-git remotes.
- **GH-006 — History as a feature.** Artifact views shall expose git history (who changed this
  requirement, when, in which change) in human terms in Product mode and raw form in
  Engineering mode.
- **GH-007 — Remote enforcement setup.** *(1.1, G-10)* Where the connected forge supports it, the
  app shall offer one-click setup and ongoing verification of branch protection requiring the
  gate check (VG-010) on trunk — the enforcement backstop for out-of-app pushes that D-113's
  no-authorization stance relies on. Missing or disabled protection is surfaced as a finding,
  never silently.

### R. App Templates & Project Contract — `TP`

*Scope: how new apps start reliable and existing apps become manageable.*

- **TP-001 — Template registry.** The app shall ship starter templates (at minimum: web
  application, API service, static site; the set is data, extensible) and support user/team
  templates from git URLs or local paths.
- **TP-002 — Template contents.** A template shall provide: a buildable scaffold, a pre-filled
  project contract (TP-004), a starter type profile (or profile reference), seed data (PV-006),
  a working test setup, and at least one deploy target definition (DR-003).
- **TP-003 — Template guarantee.** A project created from a shipped template shall — before any
  user story exists — pass its gates, run its (empty) test suite, and serve a preview. *Done
  when:* create-from-template to running preview requires zero manual fixes.
- **TP-004 — Project contract.** Every project shall carry a contract manifest declaring:
  commands (dev, test, lint, seed, build, deploy, and optionally `migrate` for ordered schema
  changes *(1.1, G-02)*), preview URL pattern, stack metadata, ordered-resource declarations
  (IG-011), and safe-command declarations (AC-006) — the single interface through which iBuildOS
  runs the project's own tooling (stack-agnosticism lives here). Multi-app repositories use
  named components (TP-009).
- **TP-005 — Contract validation.** The app shall verify the contract (commands exist and run)
  and flag breakage as findings, not runtime surprises — running only after the contract has
  been explicitly trusted (TP-008), never as a side effect of merely opening a repo *(amended
  1.1, G-04)*.
- **TP-006 — Agent-derived contract.** For repos without a contract (brownfield, custom stacks),
  an agent shall propose one by reading the repo; human-confirmed, then maintained like any
  artifact.
- **TP-007 — Template evolution.** Templates shall be versioned; projects record their template
  provenance; template updates may be offered as ordinary reviewable change-sets (never
  auto-applied).
- **TP-008 — Contract trust & execution security.** *(1.1, G-04/G-05)* Repo-declared contract
  commands shall run only after an explicit **"trust this project's contract"** confirmation —
  required on first open of a repo and again whenever the contract or referenced scripts change
  outside a trusted flow. For agent-triggered executions (stream stages, TX-002), commands shall
  be resolved from the **trunk** version of the contract/scripts; a stream that modifies the
  contract or executable script files is flagged, and its modified commands require explicit
  approval before running. Agent-triggered runs receive least-privilege environments — secrets
  are injected only where per-variable policy allows (AC-013), not by default.
- **TP-009 — Multi-component contracts.** *(1.1, G-32)* A contract may declare multiple named
  **components** (frontend, backend, shared lib …), each with its own command set, preview
  pattern, and path scope. Stories and streams bind to a component; previews may compose
  components (start the backend to preview the frontend); adoption (BF) asks its questions
  per-component. One repository remains one project.

### S. Delivery & Releases — `DR`

*Scope: shipping — releases as knowledge, deploys as contract commands.*

- **DR-001 — Releases as artifacts.** A release shall be a first-class artifact grouping stories
  (`planned_for`), with status, target date (optional), and links to its deploys and notes.
- **DR-002 — Readiness computed.** Release readiness shall be computed from the graph: scope
  built, verified, accepted; open bugs; gate status — never hand-maintained.
- **DR-003 — One-click deploy via contract.** Where the project contract defines deploy targets
  (templates always do; any project may), the app shall execute deploys from the UI —
  environment selection, secret injection (PV-005), live output, and a recorded deploy artifact
  (what, where, when, by whom, from which commit).
- **DR-004 — Deploy gate.** Deploys shall evaluate a release/deploy gate first (validation,
  tests, readiness threshold per policy); red blocks, per the universal rule (VG-005).
- **DR-005 — Tracked-only mode.** For projects without a contract deploy target, delivery shall
  be tracked (release artifacts, notes, readiness) while execution stays in the team's own
  CI/CD; the app shall never guess at deployment.
- **DR-006 — Release notes generated.** Notes shall be drafted by an agent from the release's
  actual contents (stories, changes, fixes) for human edit/approval — audience-selectable
  (user-facing vs stakeholder).
- **DR-007 — Rollback awareness.** Deploy records shall make "what is running where" answerable,
  and where the contract defines a rollback command, expose it with the same gating and
  recording as deploys.
- **DR-008 — Deploy target connection.** *(1.1, G-30)* A deploy target shall declare its auth
  requirements (named secrets and/or a provider login step). First use runs a **guided connect
  flow** — open the provider's auth, capture the resulting token into the keychain (PV-005),
  verify with a dry run — and a deploy with unmet auth fails *before* executing the command,
  offering the connect flow instead of a raw CLI error. No interactive TTY prompt ever reaches
  the user.

### T. Brownfield Adoption — `BF`

*Scope: existing applications as first-class citizens — build AND maintain.*

- **BF-001 — Adoption is a flow, not a prerequisite.** Opening an existing repo (PS-005) shall
  start a guided adoption: contract derivation → knowledge backfill → baseline → normal
  operation; each step skippable and resumable.
- **BF-002 — Non-destructive always.** Adoption shall add (bundle, profile, contract, config) and
  never move, rewrite, or reformat existing code or docs without an explicit approved proposal.
- **BF-003 — Comprehension pass.** An agent shall analyze the repo (structure, stack, run/test
  mechanics, apparent features) producing the proposed contract (TP-006) and a system summary
  the backfill builds on.
- **BF-004 — Knowledge backfill.** An agent shall propose requirements, stories (as built), and
  test-case bindings inferred from code, routes, tests, and history — delivered as reviewable
  proposal batches with per-item confidence and provenance (`backfilled`, RQ-013), approved in
  batches, never bulk-trusted.
- **BF-005 — Partial adoption.** Adoption shall be scopeable to paths/areas of the repo,
  expanding over time; the gate enforces strictly inside adopted scope and stays silent outside.
- **BF-006 — Baseline on day one.** Initial validation debt shall be baselined (VG-008) so the
  gate is useful immediately; burndown is visible (IN-006).
- **BF-007 — External references.** Artifacts shall link to incumbent-system items (Jira keys,
  ticket URLs) as typed external references; full import/migration tooling from incumbents is
  out of this catalog's boundary (§13) — the reference field is the bridge.
- **BF-008 — Same product after adoption.** Post-adoption, a brownfield project shall be
  indistinguishable in capability from a greenfield one: Product mode, streams, changes,
  previews (contract permitting), releases.
- **BF-009 — Team adoption guide.** *(1.1, lineage HS-008)* Brownfield adoption shall generate a
  maintained team-facing adoption guide artifact — what is changing and why, the new gate and
  review expectations, how the baseline (VG-008) is handled, and the staged rollout plan
  (BF-005) — distinct from individual onboarding (PS-015), so a whole team aligns on the process
  change rather than discovering it piecemeal.

### U. Team & Identity — `TM`

*Scope: multiple humans, one repo, no server of ours.*

- **TM-001 — Users & teams as artifacts.** `User` (name, git identity) and `Team` shall be
  first-class artifacts; ownership and assignment reference them. Identity is attribution, not
  authorization (deferral D-113).
- **TM-002 — Git-mediated collaboration.** Multi-user operation shall work with each person
  running the app locally against a shared remote; all shared state travels as artifacts +
  branches through git. No iBuildOS server exists. (Decision D-107.)
- **TM-003 — Assignment.** Requirements, stories, bugs, reviews, and acceptances shall be
  assignable to users/teams; profile-defined defaults may auto-assign on state transitions
  (e.g., acceptance → requirement owner).
- **TM-004 — My queue.** Each user shall have a personal queue — assigned work, requested
  reviews/acceptances, answered-question follow-ups, owned bugs — derived from artifacts +
  current git identity (feeds PS-009).
- **TM-005 — Sync-derived notifications.** On fetch/sync, the app shall diff team-relevant state
  and notify the affected local user (new assignment, review requested, your stream's PR merged,
  gate broke on trunk); no push infrastructure of ours — the remote is the bus.
- **TM-006 — Human concurrency via git.** Concurrent human edits reconcile through ordinary
  branch/PR/merge flow; the app shall surface "someone else has in-flight changes to this
  artifact" (fetch-visible) as advisory awareness, with optional soft-claim metadata — never
  hard locks.
- **TM-007 — Handoffs.** Profile-defined transitions may designate a next-responsible
  user/team/role ("ready for acceptance → PM"), putting the handoff in the recipient's queue
  explicitly.
- **TM-008 — Outbound notification adapters.** *(1.1, lineage SK-006)* Attention-queue events
  (assignment, review/acceptance request, red gate, supersession, PR merged) shall be
  deliverable to external channels — email, Slack/Teams-compatible webhooks, generic webhooks —
  as per-user, per-project **opt-in** adapters executed locally by the app (no hosted service,
  consistent with D-107), privacy-respecting per NFR-001. Without the app running, delivery
  waits for the next sync — stated honestly.
- **TM-009 — Team coordination artifacts.** *(1.1, lineage WP-011)* The default profile shall
  include optional, profile-toggled coordination types (meeting note, standup log, retro action)
  so team memory lives in the repo rather than leaking back to chat tools; teams that don't use
  them see nothing about them (like sprints, PL-003).

### V. Extensibility: Agents, Skills & Commands — `EX`

*Scope: defining and customizing how the system behaves — the user's point 6, as an area.*

- **EX-001 — Custom agents.** Users shall be able to register any ACP-speaking agent (AC-002)
  and assign it to roles (AC-008) — first-party, adapter-wrapped, or self-built.
- **EX-002 — Skills (playbooks).** A skill shall be a repo-stored, versioned instruction package
  (markdown + optional resources) that shapes how agents perform a job — house style for
  requirements, testing doctrine, framework conventions. Skills attach to roles/types and are
  injected into matching sessions (AC-010).
- **EX-003 — Commands.** A command shall be a named, parameterized operation invokable from the
  UI/palette, defined as data in the repo: either a contract/shell execution or an agent playbook
  run with a defined prompt and context. Shipped defaults are examples; teams add their own.
- **EX-004 — Workflow customization.** Statuses, transitions, gate compositions, significance
  rules (CH-001), and required approvals shall be profile data (KB-003/VG-004) — process changes
  are data edits, reviewable like everything else.
- **EX-005 — Prompt/instruction transparency.** Every instruction package the app injects into
  sessions (role instructions, skills, house rules) shall be inspectable and overridable per
  project — no hidden prompts steering the user's project.
- **EX-006 — House rules artifact.** Projects shall carry an agent-facing rules artifact
  (conventions, constraints, forbidden moves) included in every session's context and exported
  to standard guidance files (e.g., `AGENTS.md`) so agents used *outside* iBuildOS honor the
  same rules.
- **EX-007 — Configuration as reviewable data.** All project-level configuration (contract,
  profile, gates, roles, skills, commands, autonomy defaults) shall live in the repo and change
  through the same reviewable flow as any artifact.
- **EX-008 — Import/export of customizations.** Profiles, skills, commands, and templates shall
  be exportable/importable as bundles, so an organization's way of working is a shareable
  artifact (KB-009).
- **EX-009 — Extension safety.** Custom commands/skills shall declare their execution scope
  (read-only, worktree-write, network, deploy) and be gated by the same permission policy as
  agents (AC-006).
- **EX-010 — Guidance exports stay honest.** *(1.1, lineage HS-004)* Exported guidance files
  (EX-006's `AGENTS.md` and equivalents) shall be regenerated when house rules, profile, or
  contract change — or their staleness reported as a finding — so agents operating *outside*
  iBuildOS never follow rules the project has since abandoned.

### W. Insights & Reporting — `IN`

*Scope: knowing where the product stands — derived, never hand-fed.*

- **IN-001 — Progress dashboard.** Per project: requirements built/verified, stories by status,
  active streams, releases and their readiness — all derived from artifacts + git.
- **IN-002 — Quality dashboard.** Test coverage by traceability (TD-006), suite status, flake
  flags (TX-007), findings by severity, gate pass rate.
- **IN-003 — Trends from history.** Progress and quality shall be computable over git history
  (burn-up, velocity where estimates exist, findings trend) — reproducible from the repo alone.
- **IN-004 — Stakeholder digest.** On demand or scheduled, an agent shall draft an
  audience-tailored status digest (what shipped, what's in flight, risks) from repo activity —
  human-approved before any sending (which happens outside the app or via user-configured
  channels).
- **IN-005 — Activity feed.** A chronological, filterable feed of project events (merges,
  acceptances, changes, deploys, red gates) in both modes' vocabularies.
- **IN-006 — Debt & adoption burndown.** For baselined projects: baseline size over time,
  adopted-scope coverage, backfill completeness — the brownfield health view.
- **IN-007 — Agent operations view.** Runs, durations, outcomes, interventions required, and
  (where reported) usage/cost per agent and per project (BD-015) — the operational side of
  trusting agents with work.
- **IN-008 — Human workload view.** *(1.1, lineage UI-016/PM-007)* A derived, read-only view of
  open work per assignee — assigned stories/bugs, pending acceptances and reviews — so a team
  can see and rebalance load; computed from artifacts and git, never hand-maintained.

### X. Decisions & Architecture — `DA`

*Scope: capturing why the system is the way it is — decisions, architecture, operations
knowledge. (1.1 area, restoring v0.5 area AD; see Appendix B.)*

- **DA-001 — Decisions as first-class artifacts.** Significant decisions shall be capturable as
  Decision (ADR) artifacts — created directly, or **promoted** from an answered decision card
  (GU-005) or a change rationale (CH-002) in one click — with `constrains` links to the
  requirements, stories, or code areas they govern and `supersedes` history.
- **DA-002 — Decisions surface where they bind.** An artifact constrained by a decision shall
  show it, and the decision shall be part of the session context (AC-010) for streams working in
  its scope — so agents and humans hit "we already decided this" before, not after, re-deciding.
- **DA-003 — Architecture description artifacts.** Projects may carry architecture artifacts —
  system structure, component responsibilities, text-based diagram sources (rendered by the
  app) — linked to components (TP-009) and requirements, and included in relevant session
  context. A binary-only diagram shall not be the source of truth.
- **DA-004 — Runbooks.** Operational knowledge (how to run, roll back, investigate) shall be
  capturable as runbook artifacts linked to deploy targets (DR) and surfaced beside deploy and
  trunk-broken (IG-010) flows.

---

## 10. Non-functional requirements — `NFR`

- **NFR-001 — Local-first & private.** All function except agent sessions, remote sync, deploys,
  and opted-in outbound deliveries shall work offline. No artifact content shall leave the
  machine except to: the user's configured agent (under the agent's auth), the user's git
  remote, explicit deploy targets, and user-configured opt-in channels — notification adapters
  (TM-008) and approved report sends (IN-004) *(amended 1.1, G-16)*. No telemetry without
  opt-in — including from third-party dependencies, which shall be verified and disabled in the
  build (tech stack).
- **NFR-002 — No required service.** iBuildOS shall require no server, account, or subscription
  of its own to be fully functional.
- **NFR-003 — Responsive under parallel load.** The UI shall remain responsive (interactions
  < 100 ms perceived) with the configured maximum of concurrent streams, live previews, and
  validation running.
- **NFR-004 — Validation performance.** Full validation of thousands of artifacts in seconds;
  incremental validation of an edit in tens of milliseconds (VG-002).
- **NFR-005 — Determinism.** *(amended 1.1, G-12)* The deterministic-check subset of validation
  (VG-001) shall be bit-reproducible: same commit + same profile + same engine version (VG-012)
  → same findings, in UI and CLI alike (VG-010). Full gate verdicts add recorded execution
  evidence and are reproducible per the gate evidence model (VG-013).
- **NFR-006 — Crash safety & recoverability.** The repo is the durable record; the app shall
  recover from crash/restart to a consistent view with no lost committed work and resumable
  streams (BD-014).
- **NFR-007 — Security.** *(amended 1.1, G-04/G-05/G-06)* ACP-served file-system and terminal
  access enforced to stream worktrees (BD-003, AC-007); agent-native OS access directed and
  audited, with OS-level sandboxing of agent and contract processes as a **should** (enabled
  where the platform supports it) — the trust model states which scoping is enforced vs
  directed (§8). Repo-declared commands execute only after explicit trust (TP-008) and never
  during validation or on mere open. Secrets in OS keychain, never in the repo (committed-secret
  gate rule, PV-005), redacted from transcripts and logs (AC-012/AC-013); permissioned
  escalation for anything beyond the workspace (AC-006).
- **NFR-008 — Auditability.** Every consequential action — agent runs, permission grants,
  approvals, merges, deploys — shall be attributable (who/what/when/against which commit) and
  persist in the repo (BD-011, RV-007, DR-003).
- **NFR-009 — Trust & reversibility.** Nothing reaches trunk or production through the app
  without green gates; every automated step shall be inspectable before (dial), during
  (visibility), and after (records) — and reversible where git makes reversal possible.
- **NFR-010 — Authoring ergonomics.** Creating and linking artifacts shall be near-free
  (forms, AI drafting, templates, auto-linking suggestions) so the knowledge graph stays
  maintained rather than becoming homework.
- **NFR-011 — Cross-platform.** The desktop app shall support macOS, Windows, and Linux;
  keyboard-first operation shall be possible throughout; accessibility to platform norms
  (focus, contrast, screen-reader landmarks).
- **NFR-012 — Scalability.** Handle large repos and long histories (graph derived without a
  database server); degrade gracefully (progressive loading) rather than hard-capping.
- **NFR-013 — Interoperability.** Stay OKF-conformant (KB-002/008); machine-readable exports for
  graph, matrix, findings, and reports; standard git all the way down.
- **NFR-014 — Extensibility without forking.** Profiles, gates, templates, skills, commands,
  agents, and generative-UI components shall all be extensible as data/plugins (areas KB, EX, GU)
  without modifying the application.
- **NFR-015 — Self-documenting & dogfooding.** iBuildOS shall document itself in-repo, manage its
  own development as iBuildOS artifacts, and pass its own gates.
- **NFR-016 — Openness & licensing (open-core).** *(1.1, D-114 / lineage v0.5 NFR-011)* The
  engine, headless CLI, schemas, type profiles, component-catalog and bridge conventions shall
  be open source and forkable — the no-lock-in promise is verifiable, and the gate a repo
  depends on can outlive the vendor. The desktop application may be commercial/source-available.
  All on-disk formats and protocols remain public regardless.

---

## 11. Data model & default type profile

The shipped default profile — a starting point every project may extend, override, or replace
(KB-003/004). Statuses, transitions, and gate bindings live in these definitions as data.

**Type taxonomy (abstract bases keep concrete types consistent):**

```
Artifact (abstract: id, title, owner→User, status, provenance)
├── Knowledge:    ProductBrief · Requirement (Functional | NonFunctional) · Decision (ADR)
│                 · Persona · DesignDirection · Architecture · Runbook          (1.1)
├── Work (abstract: + assignee→User/Team, priority, estimate?)
│   ├── Epic (optional grouping) · Story · Task · Bug · Spike
├── Verification: TestCase (manual | automated) · TestSuite (1.1) · TestResult
├── Flow:         Change · Run · Review/Approval (1.1) · Comment (1.1) · Deploy · Release
│                 · Sprint? · Milestone
├── Coordination (optional, profile-toggled, 1.1):  MeetingNote · StandupLog · RetroAction
├── Identity:     User · Team
└── System:       TypeDefinition · Gate · Skill · Command · Template ref · Contract
```

**Core typed relationships (validated for target type + cardinality):**

| Relationship | From → To | Meaning |
|---|---|---|
| `traces_to` | Requirement → ProductBrief/Requirement *(1.1: hierarchy, RQ-004)* | requirement originates from a higher-level need |
| `implements` | Epic/Story → Requirement | work delivers a requirement |
| `parent` | Task → Story, Story → Epic | breakdown hierarchy |
| `depends_on` | Story/Task → Story/Task | ordering constraint; drives the scheduler (ST-005) |
| `verifies` | TestCase → Requirement/Story/criterion/Bug *(1.1: regression tests, ST-009/G-23)* | what a test checks or guards |
| `verified_by` | Story/Task → TestCase | inverse binding used by gates |
| `code` | Task → path glob(s) | the code a task produced (validated vs tree) |
| `affects` | Bug/Change → Requirement/Story | what a defect or change touches |
| `fixed_by` | Bug → Task | the work that fixes a defect |
| `assignee` | Work/Review → User/Team | who acts next |
| `planned_for` | Story/Bug → Release/Milestone *(1.1, G-26)* | release & milestone scoping |
| `supersedes` | Decision → Decision, Requirement → Requirement | history of intent |
| `serves` | Requirement/Story → Persona *(1.1)* | who this is for |
| `constrains` | Decision → Requirement/Story/Architecture/path *(1.1, DA-001)* | what a decision governs |
| `member_of` | TestCase → TestSuite *(1.1, TD-009)* | suite membership |
| `honors` | Story → DesignDirection *(1.1, RQ-014)* | design artifacts a story must follow |
| `result_of` | TestResult → TestCase/TestSuite · Run → Story/Task/Change/merge/adoption (optional) *(1.1, G-22)* · Deploy → Release | execution records |
| `external_ref` | any → external ID/URL | bridge to incumbent systems (BF-007) |

**The validated chain:**

```
ProductBrief → Requirement ──implements── Epic? → Story → Task ──code── files
                    │                              │        │
                    │ verifies                     │ verified_by
                    └──────────── TestCase ◄───────┘
                                      │ result_of
                                  TestResult          Story ──planned_for── Release ── Deploy
Change ──affects── Requirement/Story (recorded evolution, §CH)
Run ──result_of── Story/Task (agent execution record, §BD)
```

**Default gates (VG-004) shipped in the profile:** `requirement-ready` (RQ-009) ·
`story-ready` (ST-006) *(1.1, G-15)* · `plan` (VG-006/PL-007) · `stream-stage` and `stream-done`
(BD-005) · `merge` (IG-001) · `release/deploy` (DR-004). Each is a named list of rule IDs with
severities — editable data. *(1.1)* The **committed-secret rule** is bound to `stream-done` and
`merge` (PV-005); the **duplicate-ID rule** (KB-010) and **already-done supersession rule**
(BD-017) are bound to `merge`.

---

## 12. Decisions

Decisions made with the user on **2026-08-13** for this round. (Numbering starts at D-101 to
avoid colliding with v0.5's D-001..D-012, several of which are re-affirmed below.)

| ID | Question | Decision |
|---|---|---|
| **D-101** | Form factor | **Desktop application** (macOS/Windows/Linux), local-first; no terminal required to operate. → PS-001 |
| **D-102** | Primary persona & exposure | **Dual mode, equal citizens**: Product workspace and Engineering workspace as peer projections of one model. → PS-003 |
| **D-103** | Rewrite depth | **Full rewrite.** Concepts carry forward; no code from the previous implementation survives. Stack chosen in the tech-stack phase. |
| **D-104** | Spec lineage | **Fresh specification** (this document). v0.5 archived as reference; IDs not reused; lineage in Appendix B. |
| **D-105** | Autonomy | **Configurable dial** (`step` / `cruise` / `auto`), per-project default + per-run override; red gates and agent questions always stop. → BD-004 |
| **D-106** | App preview | **First-class live preview** per stream and for trunk; acceptance is preview-centric. → PV-001..004, RV-003 |
| **D-107** | Collaboration | **Git-mediated team**: local apps + shared remote; no hosted service of ours. → TM-002 |
| **D-108** | App stacks | **Templates + agnostic**: shipped starter templates with guarantees; any stack via the project contract. → TP-001..006 |
| **D-109** | Parallel conflicts | **Worktree isolation; agent resolves at merge time**, presented as a reviewable change; scheduler avoids predictable collisions; manual path always open. → IG-004, BD-007, IG-006 |
| **D-110** | AI plumbing | **ACP for everything** — conversation, planning, coding, tests, resolution. No separate LLM-API path; agent's own auth. → AC-001, AC-005 |
| **D-111** | Deployment | **In scope via contract**: one-click deploy where the contract defines targets (all templates); tracked-only otherwise. → DR-003, DR-005 |
| **D-112** | Brownfield | **First-class peer**: open → comprehend → backfill → baseline → same product. Incumbent import machinery out; external refs in. → area BF |
| **D-113** | Roles & authorization | **Deferred** (re-affirmed from v0.5 D-011): identity is attribution/assignment only; enforcement can lean on remote branch protection (now with setup assistance, GH-007). → TM-001 |
| **D-114** | Openness & licensing *(1.1; SPDX 1.2)* | **Open-core**: engine, CLI, schemas, profiles, and conventions open source under **Apache-2.0**; the desktop app may be commercial. Formats/protocols public regardless. → NFR-016 |
| **D-115** | `auto` and acceptance *(1.1)* | **`auto` waives the acceptance and merge stops**: green gates proceed hands-off; each waiver recorded as dial-waived and queued for after-the-fact review. Red gates and decision points always stop. → BD-004, RV-007 |
| **D-116** | OKF `status` collision *(1.2)* | Target **OKF v0.2**; iBuildOS workflow lifecycle uses the **`state`** key, leaving OKF's reserved `status` untouched; OKF `generated`/`sources` adopted for provenance (RQ-013). → KB-002, FORMATS.md §1 |

**Re-affirmed from v0.5:** git-only (no new VCS) · OKF as-is (no format fork) · deterministic
gate as authority · self-describing data-driven profile · un-phased scope-complete requirements.

**Deliberately open (decided in the tech-stack phase, not here):** implementation languages and
frameworks; desktop shell technology; generative-UI protocol adoption (AG-UI vs native events,
GU-010); the launch set of first-class-tested agents (AC-002 keeps the door open regardless);
embedded-vs-external preview mechanics per platform.

---

## 13. Boundaries (explicit non-goals)

Boundaries, not deferred phases — what iBuildOS deliberately will not be.

- **Not a hosted service.** No iBuildOS server, account system, or realtime sync backend; the
  git remote is the collaboration medium (D-107). Revisiting this is a new decision, not a phase.
- **Not an AI vendor.** No bundled model, no model credentials of ours, no per-token billing;
  agents bring their own brains and auth (D-110).
- **Not an IDE.** No general code editor, debugger, or language tooling; Engineering mode views
  code and diffs, and hands off to the user's editor for hand-editing.
- **Not a new VCS or format.** Always git; always OKF markdown + YAML.
- **Not a universal CD platform.** Deploy execution exists exactly as far as the project
  contract defines it (D-111); pipelines, fleets, and infra management belong to dedicated tools.
- **Not an incumbent-migration suite.** No Jira/Confluence importers, mirrors, or two-way sync
  in this catalog; external references (BF-007) are the bridge.
- **Not an authorization system.** Attribution and assignment, yes; permissions and approval
  authority, no (D-113) — enforce socially or via remote branch protection.
- **Not an observability platform.** *(1.1, G-34)* Production monitoring, error tracking, and
  alerting belong to dedicated tools. Production feedback enters iBuildOS as bugs (ST-009) with
  external references (BF-007) to incidents — nothing more is implied by "build and maintain."
- **Not a metrics vanity layer.** Everything reported is derived from artifacts + git;
  nothing is hand-entered to look good.

---

## Appendix A — Coverage map

The round's brief (user's six points + the "nutshell" vision), mapped to requirements — nothing
dropped.

| # | Brief point | Requirements |
|---|---|---|
| 1 | UI to record requirements or draft them with AI; stored as OKF | RQ-001..013, GU-003, KB-001..002 |
| 2 | Requirements → multiple workable stories → tasks; effective test cases | ST-001..008, TD-001..008 |
| 3 | Requirements-driven coding from stories/tasks | BD-001..015, AC-010, VG-006..007, TR-001 |
| 4 | Unit tests added alongside code | TD-005, TX-001..004, BD-005 |
| 5 | ACP for all code generation; any AI coding agent | AC-001..012, EX-001 |
| 6 | Define agents/skills/commands; customize & configure the system | EX-001..009, KB-003..005, VG-004, AC-008 |
| N1 | UI-based platform; AI agents build & maintain apps; all details in a repo | §2, PS-*, KB-001, BF-* |
| N2 | Work on items in parallel | BD-002..003, BD-007, IG-*, ST-005 |
| N3 | PM + Architect set what's needed; it gets built | §5 personas, PS-003/006, RV-003, BD-004 |
| N4 | Change/improve requirements while building | CH-001..008, RQ-007, ST-008, TD-008 |
| N5 | Chat + generative UI (AG-UI-like) for effective interaction | GU-001..011 |
| N6 | "Every product person can build software" | PS-001/004/006/011, TP-003, PV-002, RV-003, DR-003 |

## Appendix B — Lineage from v0.5

How the archived master catalog (v0.5, 2026-06-30) maps into this specification:

- **Carried forward, re-specified:** knowledge substrate & OKF (v0.5 KS → KB) · type system
  (TS → KB) · validation engine (VL → VG) · traceability (TR → TR) · work taxonomy (WP → ST/PL)
  · tests (TT → TD/TX) · bugs (BG → ST-009) · parallel worktrees & gating (VC → BD/IG) ·
  baseline/ratchet & brownfield core (VL-013 and v0.5 init-area 010..012 → BF/VG-008) · team identity & queues
  (WP-009/PM-007/SK-006 → TM) · harness scaffolding (HS → EX-006) · dashboards/reports
  (PM/SK → IN).
- **Transformed by this round:** UI area (v0.5 UI-001..016, one area among many) became the
  product itself (PS, GU, RV, and the UI-first framing of every area) · harness integration
  (HS-003, CLI subprocesses) became protocol-level ACP (AC) · the OpenSpec-style change-proposal
  workflow (SA) became Live Change Management (CH), centered on requirement evolution during
  builds · release tracking (v0.5 stance) gained contract-scoped deploy execution (DR, D-111).
- **New in this round:** generative UI (GU) · autonomy dial (BD-004) · live preview & acceptance
  (PV, RV-003) · project contract & templates (TP) · `depends_on` scheduling (ST-005, closing a
  gap the v0.5 journey review itself flagged) · environments/secrets (PV-005, likewise flagged)
  · agent conflict resolution at merge (IG-004).
- **Left behind (with the reasons):** incumbent importers/read-mirrors/bulk migration
  (IO-004/007/008 — replaced by external refs, BF-007) · hosted docs portal & static site
  (UI-009 — the desktop app is the surface; exports remain, NFR-013) · stacked-diff tooling
  integration as a requirement (VC-002/003 — incremental merges IG-008 keep the value without
  binding to a tool) · staleness-checker integration (CQ-005 — subsumed by drift detection,
  CH-008, plus semantic conformance CH-010) · sprints as default (now optional, PL-003).
- **Corrected in 1.1 (gap review G-17..G-28 and appendix findings).** The 1.0 lineage
  under-reported several drops; they are restored as follows: area AD (ADRs, architecture,
  runbooks) → the new **DA** area · engine/profile pinning (D-008/VL-012) → **VG-012** ·
  profile migration (GV-003) → **KB-011** · external notification channels (SK-006's
  Slack/Teams/email/webhook adapters) → **TM-008** · coordination artifacts & workload views
  (WP-011/UI-016) → **TM-009/IN-008** · test plans/suites (TT-007) → **TD-009/TX-008** ·
  per-project human onboarding & team adoption guides (HS-007/HS-008) → **PS-015/BF-009** ·
  guidance-drift detection (HS-004) → **EX-010** · spec↔implementation conformance (GP-003) →
  **CH-010** · report-only CI mode (VL-014) → **VG-010** · Persona (RM-005/§9) → **§11 +
  RQ-014** · openness & licensing (NFR-011) → **NFR-016** under decision **D-114** (open-core).

## Appendix C — References

- Open Knowledge Format **v0.2** — spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md> *(1.2: v0.2 reserves `status`; see D-116)*
- Agent Client Protocol — site & spec: <https://agentclientprotocol.com/> · agents directory: <https://agentclientprotocol.com/get-started/agents>
- Zed — "Bring your own agent" (ACP background): <https://zed.dev/blog/bring-your-own-agent-to-zed> · <https://zed.dev/acp>
- AG-UI (Agent-User Interaction protocol): <https://docs.ag-ui.com/introduction> · <https://www.copilotkit.ai/ag-ui>
- Generative UI patterns: <https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026>
- Conductor (parallel coding agents, UI inspiration): <https://www.conductor.build/>
- OpenSpec (change-proposal lineage): <https://github.com/Fission-AI/OpenSpec>
- EARS requirements syntax · Gherkin: <https://alistairmavin.com/ears/> · <https://cucumber.io/docs/gherkin/>
- MADR decision records: <https://adr.github.io/madr/>
- Prior iBuildOS master specification v0.5 (archived reference): `REQUIREMENTS.md` in this repo.

---

## Revision history

- **1.2.0 (2026-08-14).** Build-Ready Kit alignment: D-116 (OKF v0.2 / `state` key), D-114
  completed with Apache-2.0, KB-002 amended, Appendix C OKF citation corrected. Companion
  documents now normative: `FORMATS.md` (serialization), `DEFAULTS.md` (shipped policies),
  `EXECUTION-PLAN.md` (sequencing + Builder Charter), `ACCEPTANCE.md` (per-requirement
  done-when), `DESIGN-CHARTER.md` (UX authority), `PROVISIONING.md` (human-supplied resources).
- **1.1.0 (2026-08-14).** Gap-review amendments (`REVIEW-GAPS.md` G-01..G-42): appended
  PS-014/015, RQ-014, TD-009, BD-016/017, IG-010/011, AC-013, GU-012, KB-010/011, VG-012/013,
  CH-009/010, PV-008/009, TX-008, GH-007, TP-008/009, DR-008, BF-009, TM-008/009, EX-010,
  IN-008, NFR-016, and new area **DA** (DA-001..004); amended §6 (dial, gate), §8 (trust
  boundaries), RQ-008, ST-007, PL-007, BD-004, BD-013, AC-012, GU-005, VG-006/008/010, PV-005,
  PV-007, RV-003/007, TP-004/005, NFR-001/005/007, §11 (types, relationships, default gates),
  §13 (+observability boundary), Appendix B (corrections); added decisions D-114 (open-core)
  and D-115 (`auto` waives acceptance, dial-waived records).
- **1.0.0 (2026-08-13).** Initial specification for the UI-driven round.

*End of specification. This document is itself an iBuildOS artifact and evolves through the
workflow it describes.*
