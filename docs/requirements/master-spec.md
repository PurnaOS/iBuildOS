---
type: RequirementsSpecification
title: "IBuildOS — Master Requirements Specification"
description: >-
  The complete, structured requirements for IBuildOS: a git-native, vendor-neutral
  operating system for the software development lifecycle in the age of agentic coding.
status: draft
version: 0.5.0
date: 2026-06-30
owner: srini
tags: [ibuildos, requirements, okf, sdlc, spec-driven, traceability, agentic]
---

# IBuildOS — Master Requirements Specification

> **What this is.** The single, authoritative statement of *what IBuildOS must be and do*.
> It captures the whole vision, organized by capability area, with stable IDs. It is
> deliberately **scope-complete and un-phased**: nothing is cut, nothing is sequenced into
> "MVP vs later." Sequencing, prioritization, and delivery planning are separate decisions
> made against this catalog. This lets the scope expand without re-architecting the document.

---

## Table of Contents

0. [About this document](#0-about-this-document)
1. [Vision & problem statement](#1-vision--problem-statement)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Design principles](#3-design-principles)
4. [Actors & personas](#4-actors--personas)
5. [Glossary](#5-glossary)
6. [System context & conceptual architecture](#6-system-context--conceptual-architecture)
7. [Functional requirements (by capability area)](#7-functional-requirements)
    - [A. Knowledge Substrate & Storage — `KS`](#a-knowledge-substrate--storage--ks)
    - [B. SDLC Type System & Schema — `TS`](#b-sdlc-type-system--schema--ts)
    - [C. Specification Authoring — `SA`](#c-specification-authoring--sa)
    - [D. Requirements Management — `RM`](#d-requirements-management--rm)
    - [E. Architecture & Decision Records — `AD`](#e-architecture--decision-records--ad)
    - [F. Work Planning & Management — `WP`](#f-work-planning--management--wp)
    - [G. Bug Lifecycle — `BG`](#g-bug-lifecycle--bg)
    - [H. Test Lifecycle — `TT`](#h-test-lifecycle--tt)
    - [I. Traceability — `TR`](#i-traceability--tr)
    - [J. Validation & Linting Engine — `VL`](#j-validation--linting-engine--vl)
    - [K. Code Linting & Quality Gates — `CQ`](#k-code-linting--quality-gates--cq)
    - [L. AI Knowledge Agents — `AG`](#l-ai-knowledge-agents--ag)
    - [M. Static Analysis & Gap Detection — `GP`](#m-static-analysis--gap-detection--gp)
    - [N. Progress, Metrics & Reporting — `PM`](#n-progress-metrics--reporting--pm)
    - [O. Repository Initialization CLI — `IN`](#o-repository-initialization-cli--in)
    - [P. Agent Harness Integration & Scaffolding — `HS`](#p-agent-harness-integration--scaffolding--hs)
    - [Q. Knowledge Portal / UI — `UI`](#q-knowledge-portal--ui--ui)
    - [R. Stakeholder Communication — `SK`](#r-stakeholder-communication--sk)
    - [S. Interoperability, Import/Export & Migration — `IO`](#s-interoperability-importexport--migration--io)
    - [T. Profile Governance, Versioning & Extensibility — `GV`](#t-profile-governance-versioning--extensibility--gv)
    - [U. Version Control Workflow, Stacking & Parallel Agents — `VC`](#u-version-control-workflow-stacking--parallel-agents--vc)
8. [Non-functional requirements — `NFR`](#8-non-functional-requirements--nfr)
9. [Data model & artifact taxonomy](#9-data-model--artifact-taxonomy)
10. [Constraints & assumptions](#10-constraints--assumptions)
11. [Decisions & open questions](#11-decisions--open-questions)
12. [Explicit non-goals (boundaries)](#12-explicit-non-goals-boundaries)
- [Appendix A — Coverage map (original brief → requirements)](#appendix-a--coverage-map)
- [Appendix B — Expansions beyond the original brief](#appendix-b--expansions-beyond-the-original-brief)
- [Appendix C — References](#appendix-c--references)

---

## 0. About this document

**Purpose.** Define the requirements for IBuildOS clearly enough that humans and AI agents can
build, validate, and extend it — while leaving room to grow the scope without restructuring.

**How to read it.** Sections 1–6 set context (why, principles, actors, vocabulary, architecture).
Section 7 is the heart: functional requirements grouped into capability areas. Section 8 covers
quality attributes. Section 9 sketches the default data model. Sections 10–12 record constraints,
decisions, open questions, and boundaries. Appendix A proves nothing from the original brief was dropped.

**Requirement keywords.** *Shall* = mandatory. *Should* = strongly recommended. *May* = optional.
Each requirement has a stable ID `AREA-NNN` (e.g., `KS-001`). IDs are never reused or renumbered;
new requirements take the next free number in their area, so the catalog grows by appending.

**Status & change process.** This document is itself an IBuildOS artifact (note the OKF frontmatter)
and is expected to be edited through the same reviewable, version-controlled workflow it describes —
ideally via change proposals (see area C) reviewed as stacked diffs (area U). It dogfoods the system.

**Scope stance.** *Everything in, no phasing.* Where a requirement is an expansion beyond the
original brief, it is still stated as a peer requirement; Appendix B lists those expansions so the
provenance is transparent.

---

## 1. Vision & problem statement

Modern software teams scatter their knowledge across disconnected systems — Jira, Confluence,
Google Docs, Notion, Slack, and the git repository — while the code lives apart from all of it.
This fragmentation produces duplication, stale documentation, weak traceability, and constant
overhead keeping it all in sync. Agentic coding makes the problem sharper: AI agents can now read,
write, and reason over a whole repository, but only if the knowledge they need is *in* the
repository, structured, and machine-readable.

**IBuildOS makes the git repository the single source of truth for the entire software development
lifecycle.** Product vision, requirements, specifications, architecture, decisions, plans, work
items, bugs, tests, runbooks, and releases all live as structured, version-controlled knowledge
*next to the code they describe* — open, machine-readable, and free of vendor lock-in. Deterministic
tools validate the knowledge fast; AI agents (via whatever coding harness the team prefers) help
author it, find gaps and contradictions, and keep it honest — but never silently overwrite it.

The end state: a repository where humans **and** AI agents can fully understand, evolve, validate,
and execute a software project from first idea to production — with no required external tool, no
proprietary format, and no switching of version control.

---

## 2. Goals and non-goals

**Goals**

- Unify the SDLC in the repo: one place for knowledge + code, traceable end to end.
- Be vendor- and technology-neutral: open formats, git-native, no required SaaS, no required language.
- Be AI-native but trustworthy: agents author and advise; deterministic tools validate and gate.
- Make the knowledge *checkable*, not aspirational: schemas, typed links, and a fast linter.
- Make authoring near-free, so the knowledge graph is maintained rather than left to rot.
- Be adoptable incrementally: useful from a single CLI/CI check, with a portal and AI as add-ons.

**Non-goals** (elaborated as boundaries in §12)

- Not a new version control system — always git.
- Not a new file format — always OKF (markdown + YAML frontmatter).
- Not a system that auto-commits AI-generated changes to the source of truth.
- Not a mandate of any specific language, test framework, CI provider, or editor.
- Not a hosted system of record — the repository is the record; any UI is derived from it.

---

## 3. Design principles

1. **Repository is the source of truth.** If knowledge matters, it lives in the repo as a
   version-controlled artifact — not only in someone's head or a third-party tool.
2. **Open & lock-in-free.** Open standards (OKF), open tooling, git-native distribution. Removing
   IBuildOS must leave a repo that is still a usable pile of plain markdown + code.
3. **Documentation-as-code.** Knowledge gets the same workflow as code: branches, review, diff,
   blame, CI. Knowledge changes are reviewed, not decreed.
4. **Self-describing, data-driven schema.** The lifecycle model (types, fields, links, rules) is
   *data in the repo*, not logic in the tool. Editing markdown changes what is enforced.
5. **Deterministic first, AI second.** A fast, offline, no-AI engine is the authoritative gate. AI
   adds judgment (gaps, contradictions, drafts) on top, always as suggestions for human review.
6. **Detect-and-propose, never auto-overwrite.** AI proposes via PRs/comments; humans merge. The
   source of truth is never silently rewritten.
7. **Typed traceability.** Links between artifacts are typed and checkable, forming a knowledge
   graph that connects idea → requirement → work → code → test → release.
8. **Static analysis for speed.** Prefer fast, deterministic static analysis to answer structural
   questions; reserve the (slower, costlier) agent harness for genuinely semantic work.
9. **Incremental, reviewable change flow.** Favor small, stacked, independently reviewable changes
   and parallel isolated agent workspaces over monolithic changes (see area U).
10. **Meet teams where they are.** Integrate with existing harnesses, linters, CI, and portals
    rather than replacing them; interoperate by default.
11. **Dogfood relentlessly.** IBuildOS manages its own lifecycle as IBuildOS artifacts; its repo is
    its own best demo and its own first validation target.

---

## 4. Actors & personas

- **Solo / small-team developer (primary).** AI-forward, already doing docs-as-code or spec-driven
  development; wants traceability and structure without heavyweight tooling.
- **Tech lead / architect.** Owns the type profile, architecture, decisions, and quality gates.
- **Product manager.** Authors vision/PRDs/requirements; consumes progress and traceability views.
- **QA / test engineer.** Owns the test lifecycle, manual and automated, and coverage of requirements.
- **Reviewer.** Reviews stacked changes to knowledge + code via PRs.
- **Stakeholder / executive.** Consumes generated summaries, status, and release notes; rarely edits.
- **AI coding agent (first-class actor).** Reads the repo, authors drafts, runs in an isolated
  workspace, proposes changes, and respects the deterministic gate and human-review rules.
- **Maintainer of a shared profile.** Publishes/forks SDLC profiles for many projects to adopt.

---

## 5. Glossary

- **OKF (Open Knowledge Format).** Google Cloud's v0.1 convention: a *bundle* (directory) of
  *concepts* (markdown files with YAML frontmatter), each with a required `type`, cross-linked by
  markdown links, with permissive conformance (consumers tolerate unknown types/fields/broken links).
- **Bundle.** The directory of knowledge artifacts that IBuildOS validates.
- **Artifact / concept.** One markdown file representing one unit of knowledge (a requirement, task,
  test, ADR, etc.).
- **Type / ArtifactType.** A definition describing an artifact kind: its fields and typed
  relationships. Types are themselves OKF documents (the schema is data).
- **SDLC profile.** The project's full set of type definitions + rules — its lifecycle model.
- **Typed link / relationship.** A link from one artifact to another that names a target type and
  cardinality, so it can be validated (e.g., `implements`, `verified_by`, `traces_to`).
- **Traceability chain.** The connected path idea → requirement → epic/story → task → code → test →
  release that the system can validate end to end.
- **Linter / validation engine.** The deterministic CLI that checks the bundle against the profile.
- **Coding harness.** A pluggable AI coding tool (Claude Code, Codex, OpenCode, …) the system can
  drive for authoring and comprehension.
- **Change proposal.** An OpenSpec-style reviewable bundle of intent + spec deltas + design + tasks.
- **Stacked diffs / PRs.** A series of small, dependent, independently reviewable changes built on
  one another instead of one large PR (Graphite-style).
- **Workspace.** An isolated checkout (git worktree) where one agent works on one branch, Conductor-style.

---

## 6. System context & conceptual architecture

IBuildOS is a thin layer of *connective tissue* over mature substrates. The architecture is a set of
layers; this section is **context, not a delivery sequence** (no phasing is implied).

- **Layer 0 — Substrate (adopt as-is): OKF + git.** Artifacts are OKF concepts in a git repo.
  The format is not forked; staying conformant means other OKF consumers can read the repo for free.
- **Layer 1 — SDLC profile (core IP): self-describing types + typed links.** The lifecycle taxonomy
  and the typed traceability vocabulary that OKF deliberately leaves undefined, expressed as data.
- **Layer 2 — Deterministic engine: validation, traceability, static analysis.** A single CLI (plus
  CI check and pre-commit hook) that validates documents, resolves the link graph, and computes gaps,
  coverage, and progress — with no AI and no network.
- **Layer 3 — AI knowledge agents (suggest-only).** Gap/contradiction/staleness detection, change
  impact, and draft generation, delivered as PRs/comments through a pluggable harness.
- **Layer 4 — Surfaces.** A derived portal/UI for browsing requirements/work/tests/code, plus
  generated stakeholder communications. Surfaces read from the repo; they are never the record.
- **Cross-cutting — Workflow.** Change proposals, stacked reviewable diffs, and parallel isolated
  agent workspaces govern how changes (to knowledge and code alike) flow into the source of truth.

---

## 7. Functional requirements

Each area opens with a one-line scope note and the original brief points it covers. Requirements are
mandatory (*shall*) unless marked otherwise. "Done when" clauses give a concrete acceptance signal.

### A. Knowledge Substrate & Storage — `KS`

*Scope: how and where all non-code knowledge is stored. Covers brief points 2, 3, 6.*

- **KS-001 — Single source of truth.** All SDLC knowledge (vision, requirements, specs, architecture,
  decisions, plans, work, bugs, tests, runbooks, releases) and the code shall live in one git
  repository. *Done when:* every artifact type has a defined home in the repo and no required
  knowledge exists only in an external system.
- **KS-002 — OKF-conformant storage.** Every knowledge artifact shall be an OKF concept: a UTF-8
  markdown file with YAML frontmatter containing a non-empty `type`, inside an OKF bundle. *Done when:*
  a stock OKF consumer can read the bundle without translation.
- **KS-003 — Human- and machine-readable.** Artifacts shall render as plain markdown in any editor/GitHub
  **and** be parseable by tools/agents via frontmatter + typed links.
- **KS-004 — Configured layout, not hardcoded.** A repo config file shall declare the bundle root, the
  type-definition location, and which paths are artifacts. *Done when:* relocating the bundle requires
  only a config edit, no tool code change.
- **KS-005 — Cross-linking forms a graph.** Artifacts shall reference each other via markdown links /
  typed link blocks, yielding a navigable knowledge graph richer than the directory tree.
- **KS-006 — Progressive disclosure.** The bundle should support optional `index.md` (navigation/summary)
  and `log.md` (chronological history) files per OKF conventions.
- **KS-007 — Git-native lifecycle.** All artifact history, branching, review, and authorship shall come
  from git; no separate datastore shall be required to operate.
- **KS-008 — Graceful degradation / no lock-in.** If IBuildOS tooling is removed, the repo shall remain a
  fully usable set of plain markdown + code. (brief point 2)
- **KS-009 — Diff-friendly conventions.** Artifacts shall use stable, deterministic file-naming (slugs/IDs),
  UTF-8, and LF line endings so changes diff cleanly and IDs are stable across moves.

### B. SDLC Type System & Schema — `TS`

*Scope: the self-describing schema that defines every artifact kind. Covers brief point 7.*

- **TS-001 — Types are data.** Every artifact type shall itself be defined as an OKF document (via a
  meta-type, e.g., `ArtifactType`), not hardcoded in tooling. (brief point 7)
- **TS-002 — Generic, data-driven engine.** Tools shall know only the meta-type natively; all concrete
  types load from the repo at runtime. *Done when:* swapping the type set changes enforcement with zero
  tool code change.
- **TS-003 — Friendly schema dialect.** A type definition shall declare `fields` (required, enum/`one_of`,
  `pattern`, scalar type, doc) and `relationships` (target type, `min`/`max`, doc) in readable YAML.
- **TS-004 — Inheritance & abstraction.** Types shall support `extends` (inherit/override fields and
  relationships) and `abstract` (base types not usable directly by documents).
- **TS-005 — Escape hatch.** A definition may include a raw `json_schema` for cases the dialect cannot
  express, so the dialect stays small instead of reinventing JSON Schema.
- **TS-006 — Project-specific & versioned profile.** The type set shall be editable per project and
  version-controlled with the code; the linter reads it before validating. (brief point 7)
- **TS-007 — Typed, polymorphic relationships.** Relationships shall name a target type and cardinality;
  a target that is an abstract base shall be satisfied by any of its subtypes.
- **TS-008 — Base profile shipped.** IBuildOS shall ship a default profile covering the standard lifecycle,
  which projects extend, override, or replace.
- **TS-009 — Meta-validation.** Type definitions shall be validated against the meta-type; an unknown
  `extends` or relationship `target` shall fail with a clear, actionable message.

### C. Specification Authoring — `SA`

*Scope: how specifications are written and changed, inspired by OpenSpec. Covers brief points 5, 8.*

- **SA-001 — Spec as source of truth.** Current, authoritative specifications shall live in the repo,
  distinct from in-flight proposals. (OpenSpec `specs/`)
- **SA-002 — Change-proposal workflow.** Changes to specs shall be made through reviewable proposals that
  bundle intent, spec deltas, design, and a task breakdown. (brief points 5, 8)
- **SA-003 — Proposal artifacts.** A proposal shall capture *why* (intent), *what* (spec changes), *how*
  (design), and the *work* (tasks), each as linked artifacts.
- **SA-004 — Apply & archive.** On implementation, a proposal's deltas shall update the canonical specs and
  the proposal shall be archived with history retained.
- **SA-005 — Flexible authoring order.** Authors may create artifacts in any order (no rigid phase gates);
  completeness is enforced by the linter before an item is "done," not by the editor.
- **SA-006 — Agent-authored, human-reviewed.** Specs and proposals may be generated by coding agents and
  shall be merged by humans via review.
- **SA-007 — Structured requirement forms.** Requirement/spec bodies may use EARS statements or Gherkin
  scenarios without altering the OKF substrate.
- **SA-008 — Customizable spec schema.** The sequence/shape of spec artifacts (proposal → specs → design →
  tasks, or a project's variant) shall be definable in the profile, not hardcoded.

### D. Requirements Management — `RM`

*Scope: capturing and organizing requirements. Supports brief points 3, 16.*

- **RM-001 — Requirement hierarchy.** Support business/product requirements refined into functional and
  non-functional requirements, linked to a vision/PRD.
- **RM-002 — Stable IDs.** Every requirement shall have a stable, unique, human-readable ID that survives
  edits and moves.
- **RM-003 — Status lifecycle.** Requirements shall carry a status (e.g., proposed → accepted → implemented
  → verified → retired) defined by the profile, not hardcoded.
- **RM-004 — Ownership.** Every requirement shall name an owner.
- **RM-005 — Persona linkage.** Requirements may reference the personas/actors they serve.
- **RM-006 — Acceptance criteria.** Requirements should carry testable acceptance criteria that tests can
  verify (links into area H/I).
- **RM-007 — Prioritization metadata.** Requirements may carry priority/value metadata for planning; no
  single prioritization framework is imposed.

### E. Architecture & Decision Records — `AD`

*Scope: architecture-as-code and decision history. Expansion (see Appendix B); supports the vision's
architecture/ADR/runbook artifacts.*

- **AD-001 — Decision records.** Support ADRs (e.g., MADR-style) as first-class artifacts linked to the
  requirements, components, and work they affect.
- **AD-002 — Architecture-as-code.** Support architecture description artifacts (e.g., C4/Structurizr
  references, arc42 structure) stored in-repo and linkable.
- **AD-003 — Decision traceability.** Decisions shall link to what they constrain; a superseded decision
  shall link to its successor.
- **AD-004 — Diagrams from source.** Architecture diagrams should be generated from text-based models; a
  binary-only diagram shall not be the source of truth.
- **AD-005 — Operational runbooks.** Support runbook/operations artifacts for release and on-call knowledge.

### F. Work Planning & Management — `WP`

*Scope: the work breakdown and planning containers. Covers brief points 3, 4; supports 15.*

- **WP-001 — Work breakdown taxonomy.** Support initiative → epic → story → task → subtask, plus spikes,
  as defined types.
- **WP-002 — Parent/child links.** Work items shall link to parents with bounded cardinality, forming a
  navigable hierarchy with inverse ("realized_by") views.
- **WP-003 — Data-driven status/workflow.** Work-item statuses and transitions shall be defined by the
  profile, not hardcoded.
- **WP-004 — Planning containers.** Support releases, sprints (optional), milestones, and roadmaps that
  group/sequence work, orthogonal to the breakdown hierarchy.
- **WP-005 — Estimates & rollups.** Work items may carry estimates; planning artifacts may roll them up.
- **WP-006 — Agent-assisted planning.** Coding agents shall be able to generate/refine the work breakdown
  from requirements and specs. (brief point 4)
- **WP-007 — Assignment & ownership.** Work items shall name owners/assignees.
- **WP-008 — Owner ↔ git identity.** Every artifact's `owner` (and assignee) shall resolve to a **`User`**
  entity (`WP-009`) that maps to a git user identity (name/email/handle), so artifacts and changes attribute to
  real people via git history. The system shall not depend heavily on `CODEOWNERS` for ownership. (decision D-002)
- **WP-009 — User & Team entities.** Define **`User`** and **`Team`** as first-class artifact types — a `User`
  carries a name and git user identity (optionally email/handle); a `Team` groups Users. Work items are
  **assigned** to a User or Team via an `assignee` relationship, and ownership/assignment reference these
  entities (`WP-007`, `WP-008`). This is lightweight identity for assignment and notification — **not** a
  permissions, role, or approval model (those are deferred; see decision D-011).
- **WP-010 — Default assignee in workflow.** A workflow state/transition (defined in the profile, decision
  D-006) may declare a **default assignee** (User/Team). On entering that state the item is assigned to that
  assignee and the assignee is notified (`SK-006`), so handoffs land on a named person automatically.
- **WP-011 — Team-coordination artifacts.** The shipped base profile shall include optional team-memory
  artifact types (e.g., `MeetingNote`, `RetroAction`, `StandupLog`) so standups, retros, and decisions are
  captured as linkable, version-controlled knowledge rather than living only in external chat; teams may
  disable them. (surfaced in the UI via `UI-016`)

### G. Bug Lifecycle — `BG`

*Scope: defects from report to verified fix. Covers brief point 11.*

- **BG-001 — Bug as artifact.** Bugs shall be first-class typed artifacts with reproduction, severity,
  status, and ownership.
- **BG-002 — Defined lifecycle.** Support a profile-defined bug lifecycle (e.g., new → triaged → in-progress
  → fixed → verified → closed / won't-fix).
- **BG-003 — Linkage.** A bug shall link to the requirement/feature/component affected, the task(s) fixing
  it, and the test(s) that reproduce/verify the fix.
- **BG-004 — Regression guard.** A fixed bug should link to a test that guards against regression.
- **BG-005 — Triage metadata.** Capture severity, priority, environment, and detection source.

### H. Test Lifecycle — `TT`

*Scope: manual and automated testing as tracked knowledge. Covers brief point 12.*

- **TT-001 — Tests as artifacts.** Tests (manual and automated) shall be first-class typed artifacts.
- **TT-002 — Manual + automated.** Support manual test cases/scenarios **and** references to automated
  tests in code. (brief point 12)
- **TT-003 — Verification links.** Tests shall `verify` requirements/acceptance criteria and be the
  `verified_by` target of work items.
- **TT-004 — Status & results.** Tests shall carry status/last result (passing/failing/skipped): automated
  results ingestable from CI; manual results recorded by a human.
- **TT-005 — Coverage view.** The system shall report which requirements do and do not have verifying tests.
- **TT-006 — Generated scenarios.** Agents shall be able to generate test scenarios from stories/requirements.
- **TT-007 — Plans & suites.** Support grouping tests into plans/suites for a feature or release.
- **TT-008 — Results as OKF artifacts.** Test results (automated and manual) shall be stored as OKF
  documents in the output, so results are themselves versioned, validated knowledge rather than transient
  CI logs. (decision D-009)
- **TT-009 — Run tests from the tool.** IBuildOS shall be able to **trigger and run tests** — orchestrating
  the project's automated test runners and guiding manual test execution — then capture the results and store
  them as OKF artifacts (`TT-008`). It is runner-agnostic and orchestrates existing tools (cf. `CQ-001`)
  rather than embedding a test framework. (also runnable from the UI, `UI-013`)

### I. Traceability — `TR`

*Scope: connecting and validating the full chain. Covers brief point 16.*

- **TR-001 — End-to-end chain.** Support and validate the chain idea → requirement → epic/story → task →
  code → test → release.
- **TR-002 — Typed link resolution.** Every typed link shall resolve to an existing artifact of the correct
  target type and cardinality (deterministically checkable).
- **TR-003 — Bidirectional navigation.** Traceability shall be navigable forward (requirement → code) and
  backward (code → requirement).
- **TR-004 — Code references.** Tasks shall reference the code (path globs / symbols) that implements them;
  references shall be validated against the working tree. (supports brief point 14)
- **TR-005 — Orphan & gap detection.** Detect orphans: a requirement with no implementing work, a task with
  no test, code with no linked task, etc.
- **TR-006 — Traceability matrix & graph.** Produce a requirements traceability matrix and a machine-readable
  graph export.
- **TR-007 — Scoped queries.** Support traceability scoped to a release/milestone (e.g., "is this release's
  scope fully traced and tested?").

### J. Validation & Linting Engine — `VL`

*Scope: the deterministic, no-AI structural gate. Covers brief points 7, 13 (docs lint).*

- **VL-001 — Deterministic structural linter.** A CLI shall validate the knowledge base with **no AI and
  no network** — purely from the profile + files. (brief point 7)
- **VL-002 — Reads project definitions.** The linter shall load the repo's type definitions and config
  before validating; nothing about concrete types is hardcoded. (brief point 7)
- **VL-003 — Document validation.** Validate required fields, enums, patterns, and scalar types against the
  resolved type for each artifact.
- **VL-004 — Link/graph validation.** Validate that typed links resolve to the correct target type and
  cardinality; report unresolved or wrong-type links.
- **VL-005 — Completeness rules.** Provide configurable rules for orphans, missing tests, missing code refs,
  missing owners, and broken/stale chains.
- **VL-006 — OKF-tolerant.** Unknown types shall be tolerated (at most a warning); the linter shall never
  reject a readable OKF bundle outright. (OKF permissive conformance)
- **VL-007 — Machine-readable output.** Support `--format json` with a stable schema (severity, file, line,
  rule, message) plus human-readable text; exit non-zero on errors for CI.
- **VL-008 — CI integration.** Ship as a CI check (e.g., a GitHub Action) that annotates findings on PRs.
- **VL-009 — Local & pre-commit.** Run locally and as a pre-commit hook, fast enough for interactive use.
- **VL-010 — Configurable severity.** Each rule shall be configurable to error / warning / off per project.
- **VL-011 — Docs linting.** Validate documentation conventions — required sections, structure, broken
  internal links, orphaned docs — as part of the deterministic lint. (brief point 13, docs)
- **VL-012 — Per-commit consistency (baseline-relative).** The repository should validate cleanly at **every
  commit** — meaning clean **relative to a committed baseline** of accepted pre-existing debt (`VL-013`): no
  *new* violations are introduced even if legacy debt remains. On a greenfield repo the baseline is empty, so
  this is full consistency. The active profile and tool versions shall be pinned in-repo so tool, profile, and
  OKF-spec versions stay consistent within a commit. (decisions D-008, D-012)
- **VL-013 — Baseline & ratcheting (brownfield).** The linter shall support a committed **baseline** recording
  accepted pre-existing violations (by rule + artifact + fingerprint), reported as informational debt but **not**
  failing the gate, plus a **changed-artifacts-only** mode so the per-commit gate (`VL-012`) blocks only *new or
  modified* artifacts. The baseline may only shrink (ratchet); a command regenerates/refreshes it. (decision D-012)
- **VL-014 — Non-blocking adoption (CI) mode.** The CI gate (`VL-008`) shall support a **report-only /
  non-blocking** mode that annotates findings without failing the build, shall compose with (never require
  replacing) an existing pipeline, and shall document a promotion path from non-blocking to blocking as the
  baseline (`VL-013`) shrinks — so adopting the gate on a brownfield repo does not halt in-flight feature work.

### K. Code Linting & Quality Gates — `CQ`

*Scope: code quality, orchestrated not reinvented. Covers brief point 13 (code lint).*

- **CQ-001 — Integrate existing linters.** Integrate with the project's existing language linters/formatters
  rather than reinventing them. (brief point 13, code)
- **CQ-002 — Unified gate.** Provide a single command/CI gate that runs docs-lint + code-lint + traceability
  checks and reports results together.
- **CQ-003 — Configurable toolchain.** Which code linters run shall be project-configured; IBuildOS
  orchestrates and is language-agnostic. (no lock-in)
- **CQ-004 — Results feed reporting.** Code-quality results may feed gap and progress reporting (areas M, N).
- **CQ-005 — Staleness checker integration.** IBuildOS shall integrate and run the team's existing staleness
  checker as an orchestrated external tool, surface its findings, and feed them into the quality gate
  (`CQ-002`) and knowledge-base health metrics (`PM-004`). IBuildOS does not reimplement staleness detection.
  (decision D-010)

### L. AI Knowledge Agents — `AG`

*Scope: semantic assistance that deterministic tools can't provide. Covers brief points 4, 7 (AI checks).*

- **AG-001 — Semantic validation.** Agents shall detect contradictions, ambiguities, duplications, and
  missing requirements/tests that deterministic linting cannot. (brief point 7)
- **AG-002 — Generation & editing.** Agents shall be able to **draft, edit, and modify** artifacts (PRDs,
  specs, ADRs, stories, tasks, tests, release notes) from existing repo context — creating new artifacts and
  revising existing ones, invokable from CLI or UI (`UI-014`). (brief point 4)
- **AG-003 — Suggest-only / detect-and-propose.** Agents shall never silently rewrite the source of truth;
  output is delivered as PRs/comments for human review. (principle 6)
- **AG-004 — Staleness detection (delegated).** Staleness shall be detected by the team's existing,
  already-built **staleness checker**, which IBuildOS integrates and runs (see `CQ-005`); the AI layer only
  triages and explains its findings — it does not compute drift itself. (decision D-010)
- **AG-005 — Change-impact analysis.** Given a diff or proposed change, agents shall identify affected
  requirements, tests, and docs.
- **AG-006 — Harness-agnostic.** Agents shall run via pluggable harnesses (Claude Code, Codex, OpenCode, …),
  not a single vendor. (brief points 2, 4)
- **AG-007 — Deterministic-first.** AI shall augment, never replace, the deterministic engine; AI findings
  shall be clearly labeled as advisory.
- **AG-008 — Auditable.** Agent prompts/commands shall live in the repo and agent actions shall be logged
  and reviewable.

### M. Static Analysis & Gap Detection — `GP`

*Scope: fast, deterministic answers about code↔knowledge alignment. Covers brief points 14, 18.*

- **GP-001 — Fast static analysis.** Provide deterministic static-analysis tools that answer structural
  questions faster than invoking an agent. (brief point 18)
- **GP-002 — Code↔task/requirement gap.** Detect divergence between declared tasks/requirements and actual
  code (e.g., tasks marked done with no matching code; code with no linked task). (brief point 14)
- **GP-003 — Spec↔implementation drift.** Detect where implementation diverges from the spec.
- **GP-004 — Test gaps.** Detect requirements/code without tests and tasks "done" with absent/failing tests.
- **GP-005 — Graph at build time.** Derive the knowledge graph by walking links — no graph database or
  server required.
- **GP-006 — Exportable analysis.** Emit gap and graph data in machine-readable form for the UI and reports.

### N. Progress, Metrics & Reporting — `PM`

*Scope: measuring plan progress and knowledge-base health. Covers brief point 15.*

- **PM-001 — Plan progress.** Compute completed vs pending initiatives/epics/stories/tasks against plans.
  (brief point 15)
- **PM-002 — Velocity & burn.** Derive burn-up/down and velocity from artifact status + git history, without
  manual status entry beyond the artifacts themselves.
- **PM-003 — Release/milestone readiness.** Report scope, completion %, and open risks per release/milestone.
- **PM-004 — Knowledge-base health.** Report coverage (requirements with tests, tasks with code), staleness,
  orphan counts, and validation pass rate.
- **PM-005 — Trends over time.** Compute metrics from git history to show trends, not just snapshots.
- **PM-006 — Derived, reproducible.** All metrics shall be computed from the repo, reproducibly — no separate
  hand-maintained tracker.
- **PM-007 — Personal queue ("my plate").** The system shall aggregate, for the current `User` (resolved from
  git identity), everything on their plate — work assigned to them, reviews requested of them, bugs they own,
  and pending notifications — exposed via the **CLI** (e.g., `iBuild mine`) and the UI (`UI-015`). Derived from
  assignment + review state, not hand-maintained.
- **PM-008 — Adoption & migration coverage.** The system shall compute, from the repo, **adoption coverage**
  (share of code paths, modules, and issues under management — linked, owned, validated — versus outside it)
  and **migration burndown** (remaining baselined violations, `VL-013`, and un-migrated incumbent items) as a
  trend over git history, so a lead can track how much of the repo is managed and how fast the gap is closing.

### O. Repository Initialization CLI — `IN`

*Scope: standing up or adopting the framework in a repo. Covers brief points 9, 10.*

- **IN-001 — Init command.** A CLI shall initialize a repo with the IBuildOS structure (bundle, config, base
  profile, scaffolding). (brief point 9)
- **IN-002 — Greenfield flow.** Detect a greenfield project, interactively ask scoping questions, and scaffold
  a repo tailored to the answers. (brief point 9)
- **IN-003 — Brownfield flow.** Detect an existing project, read its code and docs, understand its structure,
  and propose how to restructure it to adopt the framework. (brief point 9)
- **IN-004 — Harness-powered comprehension.** The init CLI shall be able to drive a coding harness (Claude
  Code/Codex/…) internally to comprehend a brownfield repo. (brief point 9)
- **IN-005 — Non-destructive & reviewable.** Brownfield changes shall be proposed (plan/PR) and applied only
  on approval; nothing is overwritten silently. (principle 6)
- **IN-006 — Idempotent & upgradable.** Re-running init shall upgrade structure/profile safely without
  clobbering user content.
- **IN-007 — Profile selection.** Init shall let the user choose and customize the SDLC profile and conventions.
- **IN-008 — Default templates.** Init shall install a default set of **artifact templates** (fill-in-the-blank
  scaffolds for each type — requirement, spec/proposal, ADR, epic/story/task, bug, test, release, etc.), so
  authoring a new artifact starts from a conformant skeleton. (supports `NFR-008`)
- **IN-009 — Default workflow & gates configured.** Init shall configure a ready-to-use default **workflow**:
  the process loop (spec → plan → tasks → implement → validate → review → release) with the profile's default
  statuses/lifecycles, plus wired-in CI validation (`VL-008`) and a pre-commit hook (`VL-009`). All of it stays
  customizable in the profile afterward (decision D-006).
- **IN-010 — Retroactive traceability backfill.** The brownfield flow shall use the coding harness to **infer
  and propose an initial traceability graph** from existing code, tests, and history — drafting Requirement/
  Test/Task artifacts and their typed links (`verifies`, `code`, `implements`) as reviewable proposals
  (`IN-005`), with per-link confidence/provenance recorded for human triage — so the chain is bootstrapped, not
  authored entirely by hand. (brief point 9)
- **IN-011 — Phased, path-scoped adoption.** The system shall support adopting IBuildOS over a **subset of the
  repo first and expanding** — configurable in-scope paths/areas (building on `KS-004`), the gate enforced
  strictly inside adopted areas and leniently or off outside them, and per-area ownership/rules added as
  coverage grows — so a team can roll out subsystem-by-subsystem (intra-repo, per decision D-005).
- **IN-012 — Adoption as tracked work.** The brownfield/adoption flow shall **scaffold the migration itself as
  IBuildOS artifacts** — an adoption Initiative with per-area epics and backfill/baseline-burndown tasks linked
  to owners and a target release — so the rollout is dogfooded and visible in progress (`PM-001`) and adoption
  (`PM-008`) reporting rather than tracked outside the repo. (principle 11)

### P. Agent Harness Integration & Scaffolding — `HS`

*Scope: making agents work within the framework's rules. Covers brief points 4, 10.*

- **HS-001 — Generate harness guidance.** Init/setup shall generate agent-guidance files (e.g., `CLAUDE.md`,
  `AGENTS.md`) that encode the framework's rules. (brief point 10)
- **HS-002 — Skills & commands.** Install repo-local skills/commands/workflows that drive authoring, planning,
  validation, and generation per the framework. (brief point 10)
- **HS-003 — Harness-agnostic interface.** Integration shall work across multiple harnesses via a common
  interface/adapters. (brief points 2, 4)
- **HS-004 — Keep guidance in sync.** Generated guidance shall update as the profile/conventions change, and
  drift shall be detectable.
- **HS-005 — Encoded guardrails.** Generated guidance shall encode the suggest-only, human-review, and
  deterministic-first rules so agents stay within the framework.
- **HS-006 — Workflow commands.** Provide commands for the spec → plan → tasks → implement → validate loop,
  usable by both humans and agents.
- **HS-007 — Human onboarding.** Provide a guided **onboarding flow via CLI and UI** for new human
  contributors, plus maintained **user documentation**, covering repo layout, the active profile's
  workflow/statuses, and how to make a first reviewed change — kept in sync with the profile alongside agent
  guidance (`HS-004`).
- **HS-008 — Team adoption & change-management guidance.** Init/adoption shall generate a maintained
  **adoption guide/runbook for an existing team** — what is changing and why, the new gate/review expectations,
  how the legacy baseline (`VL-013`) is handled, and a staged transition plan — distinct from individual
  onboarding (`HS-007`), so a whole team aligns on the process change rather than discovering it piecemeal.

### Q. Knowledge Portal / UI — `UI`

*Scope: a derived surface to view, author, review, plan, and operate the lifecycle. Covers brief point 17
(conductor.build-style).*

- **UI-001 — Unified view.** Provide a UI to browse and search requirements, work, tests, architecture,
  decisions, and code, linked together. (brief point 17)
- **UI-002 — Traceability views.** Visualize the traceability graph and matrices; navigate forward and back.
- **UI-003 — Dashboards.** Provide progress, coverage, health, and release-readiness dashboards.
- **UI-004 — Generated from repo.** The portal shall be generated/derived from the repo (static-site-friendly);
  it is never a separate system of record.
- **UI-005 — Search & discovery.** Provide full-text search across all artifacts, with optional AI-assisted
  discovery.
- **UI-006 — Conductor-like local app.** Offer a modern, fast, agent-aware **local working app** inspired
  by conductor.build — the primary day-to-day surface — including a view of what parallel agents/workspaces
  are doing and their validation state. (brief point 17; decision D-004; links to area U)
- **UI-007 — Borrow, don't reinvent.** Prefer existing portal tech (MkDocs, Backstage/TechDocs, or a static
  generator) fed by IBuildOS exports where it suffices. (no lock-in)
- **UI-008 — Read-first, edit-optional.** Viewing/navigation is primary; any editing writes back to the repo
  via git/PR, preserving the source of truth.
- **UI-009 — Hosted docs site.** Publish a static, read-only documentation site (e.g., MkDocs or
  Backstage/TechDocs) generated from the repo so stakeholders can browse requirements/work/tests/architecture
  without local tooling. The local app (UI-006) and the hosted site are complementary surfaces. (decision D-004)
- **UI-010 — Authoring in the UI.** The UI shall support **authoring and editing** requirements, specs, ADRs,
  and other artifacts — manually through guided, template-backed forms that validate against the profile
  inline, or with coding-agent assistance (`UI-014`) — writing changes back to the repo via git/PR (`UI-008`).
- **UI-011 — Review & approve.** The UI shall support **reviewing** proposed changes (change proposals and
  stacked diffs), commenting, and approving/merging — surfacing each change's validation result and
  traceability impact. (ties to areas C and U)
- **UI-012 — Work planning.** The UI shall support **planning work**: managing the backlog and boards,
  creating and arranging initiatives → epics → stories → tasks, assigning owners, and sequencing into
  releases/sprints/roadmaps — all persisted as artifacts. (ties to area F)
- **UI-013 — Operate the system from the UI.** The UI shall be able to **run IBuildOS operations** — validate
  and lint, run tests (`TT-009`), run AI agents, generate artifacts/scaffolds, run init/setup, and build or
  refresh the portal — so the system is fully operable from the UI, not only the CLI.
- **UI-014 — Agent-assisted authoring & editing.** From the UI, the user shall be able to invoke a **coding
  agent** (Claude Code, Codex, OpenCode, …) to create, edit, or modify artifacts conversationally — describe
  the change and have the agent apply it across one or many artifacts. Agent changes return as **reviewable
  diffs/proposals** (never silent writes; see `AG-003` and principle 6) that the user validates and approves
  via `UI-011`. Harness-agnostic (`HS-003`).
- **UI-015 — My work & notifications.** The UI shall present the current User's **personal queue** — assigned
  work, review requests, owned bugs, and notifications (`PM-007`, `SK-006`) — as a first-class personal view.
- **UI-016 — Team management & memory views.** The UI shall surface team-management views — per-person and
  per-team workload, plus the team-coordination artifacts (`WP-011`) — so managers can balance load and the
  team's coordination memory lives in the system.

### R. Stakeholder Communication — `SK`

*Scope: generated, audience-tailored updates. Expansion (see Appendix B); from the project vision.*

- **SK-001 — Change summaries.** Generate human-readable change summaries from repo activity (commits, applied
  proposals, status changes).
- **SK-002 — Release notes.** Generate release notes from completed work + spec changes.
- **SK-003 — Status reports.** Generate weekly/executive status (progress, risks, what changed) from the repo.
- **SK-004 — Audience-tailored.** Allow summaries targeted to different audiences (engineering, PM, executive).
- **SK-005 — Suggest-only distribution.** Communications shall be drafted for human review before sending; no
  automatic broadcast. (principle 6)
- **SK-006 — Team notifications.** The system shall notify the relevant User/Team on key events — assignment
  (including a workflow default assignee, `WP-010`), review requests, and **PR merges** (e.g., via a GitHub
  PR-merge webhook/Action, notifying users whose assigned work merged) — through configurable, opt-in channels
  (in-app, email, Slack/Teams, webhook), respecting local-first/privacy (`NFR-006`). Unlike stakeholder reports
  (`SK-005`), these interpersonal notifications may be delivered automatically once opted in.

### S. Interoperability, Import/Export & Migration — `IO`

*Scope: working with the wider ecosystem. Covers brief point 2; expansion in places.*

- **IO-001 — OKF-conformant interop.** Bundles shall be readable by stock OKF consumers; IBuildOS shall not
  fork the format. (brief point 2)
- **IO-002 — Standard-aligned links (kept simple).** The typed-link vocabulary may borrow naming from
  established traceability concepts (e.g., OSLC) where it is low-cost, but **simplicity wins**: adopt only
  minimal alignment, not the full model. (decision D-003)
- **IO-003 — Ingest SDD outputs.** Import artifacts produced by Spec Kit / Kiro / OpenSpec (e.g.,
  `requirements.md`, `design.md`, `tasks.md`, `specs/`). (brief point 5)
- **IO-004 — Import from incumbents.** Provide optional one-way importers (Jira/Confluence/etc. → OKF) to
  bootstrap a repo.
- **IO-005 — Export.** Export the knowledge graph (JSON/GraphML) and reports for external tools and the UI.
- **IO-006 — No required external services.** The system shall function fully offline/self-hosted; all
  integrations are optional adapters. (brief point 2)
- **IO-007 — Incumbent coexistence during migration.** Beyond one-shot import (`IO-004`), the system shall
  support **incremental re-import and a read-only mirror** of incumbent systems (Jira/Confluence/etc.) during
  transition — a stable external-ID link on each imported artifact, idempotent re-sync of changed source items,
  and optional outward status reflection — so a team can run IBuildOS alongside incumbents for months without
  dual data entry or a hard cutover. Two-way write-back stays opt-in; read-mirror is the default.
- **IO-008 — Bulk assisted migration operations.** The system shall provide **batch migration operations** —
  bulk import of incumbent issues/tests into typed artifacts, bulk owner/`User` backfill, agent-assisted bulk
  classification of legacy docs to OKF types via a reviewable mapping table, and verify-link inference for
  existing tests — applied idempotently and delivered as reviewable proposals (`IN-005`), so a large
  back-catalog migrates in vetted batches rather than one artifact at a time.

### T. Profile Governance, Versioning & Extensibility — `GV`

*Scope: evolving the lifecycle model safely. Expansion of brief point 7.*

- **GV-001 — Versioned profile.** The SDLC profile (type set + rules) shall be semantically versioned and
  shareable across projects.
- **GV-002 — Pluggable engine.** Validators, generators, exporters, and harness adapters shall be
  pluggable/extensible without forking core.
- **GV-003 — Compatibility story.** Profile upgrades shall have a migration/compatibility path; the linter
  shall be able to target a specific profile version.
- **GV-004 — Shared/forkable profiles.** Organizations shall be able to publish base profiles that projects
  fork and extend.
- **GV-005 — Governance via PRs.** Changes to the profile/rules shall go through the same reviewable git
  workflow as other artifacts.

### U. Version Control Workflow, Stacking & Parallel Agents — `VC`

*Scope: how changes to knowledge and code flow into the source of truth. Expansion incorporating
Graphite-style stacked diffs ("gstack") and Conductor-style parallel agent workspaces.*

- **VC-001 — Branch/PR-based change.** Changes to knowledge and code shall flow through reviewable git
  branches/PRs — the single review gate for docs and code alike. (principle 3)
- **VC-002 — Stacked changes.** Support small, dependent, independently reviewable **stacked diffs/PRs** so
  agentic work is reviewed in focused layers rather than one monolithic PR. Integration with stacking tools
  (e.g., Graphite `gt`) shall work over native git, with no vendor lock-in.
- **VC-003 — Proposal ↔ stack mapping.** A change proposal (area C) should map cleanly to a stack — each task
  a diff in the stack — preserving traceability across the whole stack.
- **VC-004 — Parallel agent workspaces.** Support running multiple coding agents in parallel, each in an
  isolated workspace (git worktree) on its own branch, à la Conductor.
- **VC-005 — Isolated, validated, mergeable.** Each agent workspace shall be isolated; its output shall pass
  the deterministic gate (areas J/K/TR) before review and merge.
- **VC-006 — Orchestration visibility.** Surface what each parallel agent/workspace is working on and its
  validation status (links to UI-006).
- **VC-007 — Stack-aware validation.** Validation/traceability shall run per diff in a stack and on the
  integrated result, so a stack never merges with a broken chain.
- **VC-008 — Tool-agnostic workflow.** Stacking and parallel orchestration shall integrate with existing
  tools (Graphite, native worktrees, Conductor, or equivalents); none shall be mandatory. (brief point 2)
- **VC-009 — Local conflict resolution.** When parallel agents/workspaces produce overlapping or conflicting
  changes, a **developer finalizes the resolution locally** before merge. IBuildOS surfaces the conflict and
  each workspace's validation state, but never auto-resolves. (decision D-007)
- **VC-010 — Human change contention via PRs.** Concurrent edits by multiple **people** to the same artifact
  are reconciled through the standard branch/PR **review-and-merge** flow (`VC-001`) — the same gate as code —
  rather than any locking mechanism. (Human counterpart of `VC-009`.)

---

## 8. Non-functional requirements — `NFR`

- **NFR-001 — Vendor/technology neutrality.** No required proprietary service, format, or VCS beyond git;
  removing IBuildOS leaves a usable plain-markdown + code repo. (brief point 2)
- **NFR-002 — Determinism.** The structural linter shall be fully deterministic and reproducible (same inputs
  → same output), with no network or AI.
- **NFR-003 — Performance.** Validation + static analysis shall be fast enough for pre-commit and CI on large
  repos (target: thousands of artifacts validated in seconds). (brief point 18)
- **NFR-004 — Portability & distribution.** Core tools shall be easy to install and cross-platform (a single
  self-contained binary is preferred) with minimal dependencies.
- **NFR-005 — Scalability.** Handle large knowledge bases and long histories; derive the graph without a
  server or database.
- **NFR-006 — Local-first & privacy.** Work offline; no artifact content leaves the user's environment except
  via explicitly configured AI/harness calls.
- **NFR-007 — Security.** Respect secret handling; execute no untrusted code during linting; be supply-chain
  conscious.
- **NFR-008 — Authoring ergonomics.** Authoring artifacts and maintaining links shall be near-free (templates,
  scaffolding, agent assistance) so the graph is maintained, not abandoned.
- **NFR-009 — Trust & reliability.** AI shall never mutate the source of truth without human approval; the
  deterministic gate is authoritative.
- **NFR-010 — Observability.** Diagnostics shall be actionable (file, line, rule, and how to fix); agent
  actions shall be auditable.
- **NFR-011 — Openness & licensing.** The standard and tooling shall be open and forkable; the spec and
  schemas are public.
- **NFR-012 — Extensibility.** Every layer (types, rules, generators, exporters, UI, harness) shall be
  extensible without forking core.
- **NFR-013 — Interoperability.** Stay OKF-conformant and standards-aligned; support import and export.
- **NFR-014 — Permissive compatibility.** Tolerate unknown types, missing optional fields, and broken links
  rather than rejecting a bundle (OKF conformance).
- **NFR-015 — Self-documenting.** The framework shall document itself in-repo and pass its own validation
  (dogfooding).

---

## 9. Data model & artifact taxonomy

This is the **default profile** — a starting point, not a fixed schema. Per `TS-006`/`TS-008`, every project
may extend, override, or replace it by editing type definitions. It is included here so the requirements above
have a concrete referent.

> **Workflow customization lives here (decision D-006).** Statuses, lifecycles, and allowed transitions for
> each artifact kind are expressed in these type definitions (the profile), not in a separate config surface
> or tool code — so changing a workflow is a data edit (see `TS-003`/`TS-004`, `WP-003`).

**Inheritance (abstract bases keep concrete types consistent):**

```
WorkItem (abstract: id, title, owner→User, status, assignee→User/Team)
├── BacklogItem (abstract: + priority, estimate, planned_for→Release, scheduled_in→Sprint)
│   ├── Initiative · Epic · Story · Task · Bug · Spike
├── Requirement (abstract: + status, priority, traces_to→PRD)
│   ├── BusinessRequirement · FunctionalRequirement · NonFunctionalRequirement
├── Subtask
├── Knowledge:  Vision · PRD · Persona · ADR · Architecture · Runbook
├── Identity:  User · Team
├── Coordination:  MeetingNote · RetroAction · StandupLog
├── Verification:  Test
└── Planning:  Release · Sprint · Milestone · Roadmap
```

**Core typed relationships (validated for target type + cardinality):**

| Relationship | From → To | Meaning |
|---|---|---|
| `traces_to` | Requirement → PRD/Vision | requirement originates from a higher-level need |
| `implements` | Epic/Story/Task → Requirement | work delivers a requirement |
| `parent` | work item → parent work item | breakdown hierarchy (bounded cardinality) |
| `assignee` | work item → User/Team | who is doing the work (notified on assignment) |
| `verifies` | Test → Requirement | a test checks a requirement / acceptance criterion |
| `verified_by` | work item → Test | work is verified by a test |
| `code` | Task → repo path glob(s)/symbols | the code that implements the task |
| `affects` | Bug → Requirement/Component | what a defect impacts |
| `fixed_by` | Bug → Task | the work that fixes a defect |
| `supersedes` | ADR → ADR | decision history |
| `planned_for` | BacklogItem → Release | release planning |
| `scheduled_in` | BacklogItem → Sprint | iteration planning |
| `requires` | Milestone → work item | milestone dependencies |
| `includes` | Roadmap → Initiative | roadmap composition |

**The validated traceability chain:**

```
Vision → PRD → BusinessRequirement → Functional/NonFunctional Requirement
                                              │ implements
                    Initiative → Epic → Story → Task → Subtask
                                              │            │ implements / code
                                              └ verified_by │
                                                   Test ◄────┘ verifies
                                              ↓ planned_for
                                           Release
```

Each artifact is one markdown file with typed frontmatter, version-controlled in git and validated by the
engine — so every relationship above is checkable, not aspirational.

---

## 10. Constraints & assumptions

- **Git is the VCS.** The substrate assumes git; non-git VCS support is out of scope (see §12).
- **Markdown + YAML is the format.** All knowledge is OKF concepts; richer structures use the
  `json_schema` escape hatch rather than a new format.
- **AI features require a harness.** Areas L, AG-driven parts of O/P/SK assume a pluggable coding
  harness is available; the deterministic core (areas A–K, M–N, TR, VC validation) does not.
- **Initial audience.** AI-forward solo devs and small teams already doing docs-as-code / spec-driven
  development — not enterprises mid-migration off Jira. This shapes ergonomics and defaults.
- **Builder context.** Likely built incrementally by a small team or solo maintainer; this catalog is
  intentionally un-phased so that delivery sequencing is a separate, revisable decision.
- **Implementation stack (decision D-001).** TypeScript, compiled to a single self-contained executable with
  **Bun**; the same stack also powers the local UI app. This assumes TypeScript integrates cleanly with the
  chosen coding harness — to be validated early.
- **Single-repository scope (decision D-005).** Targets a single repository; cross-repo federation is not
  pursued for now (see §12).
- **Brownfield adoption is incremental (decision D-012).** Existing repos adopt via a committed **baseline**
  and ratchet (`VL-013`), a non-blocking CI mode (`VL-014`), and assisted backfill/migration — not a big-bang;
  "consistent" (`VL-012`) means clean *relative to that baseline*.

---

## 11. Decisions & open questions

The questions in the first draft were reviewed with the user on **2026-06-30**. The ten initial questions are
decisions **D-001–D-010**; later decisions are appended below (**D-011+**). All should be promoted to decision
records (ADRs, area E) once the bundle exists.

| ID | Question | Decision |
|---|---|---|
| **D-001** | Implementation language | **TypeScript**, compiled to a single self-contained executable with **Bun**; the same stack also powers the local UI app (D-004). Assumes TypeScript integrates cleanly with the coding harness — validate early. → §10 |
| **D-002** | Ownership / identity | Each artifact `owner` links to the contributor's **git user identity**; do **not** lean heavily on `CODEOWNERS`. → `WP-008` |
| **D-003** | OSLC vocabulary depth | Favor **simplicity** — adopt only minimal, low-cost OSLC-aligned link naming, not the full model. → `IO-002` |
| **D-004** | UI: build vs borrow | **Both, by role:** a local, conductor-like **working app** (`UI-006`) for daily use, plus **Backstage/MkDocs** for a hosted, read-only docs site (`UI-009`) so stakeholders can browse. |
| **D-005** | Multi-repo / federation | **Single repository** scope; cross-repo federation is not pursued for now. → §10, §12 |
| **D-006** | Status / workflow customization | Defined in the **data model & artifact taxonomy** (the type profile, §9) — not a separate config surface. → `TS-003`/`TS-004`, `WP-003` |
| **D-007** | Parallel-agent conflict resolution | Finalized **locally by a developer** before merge; IBuildOS surfaces conflicts + validation state but never auto-resolves. → `VC-009` |
| **D-008** | Tool / profile / spec versioning | Invariant: **every git commit must be consistent** — the repo validates cleanly per commit, with profile and tool versions pinned in-repo so they agree within each commit. **Refined by D-012**: for brownfield, "consistent" means clean *relative to a committed baseline*. → `VL-012` |
| **D-009** | Test-result capture | **Store test results as OKF artifacts** in the output (automated and manual alike), so results are versioned, validated knowledge. → `TT-008` |
| **D-010** | Staleness detection | Use the team's **existing, already-built staleness checker**; IBuildOS integrates and runs it rather than inventing a heuristic. → `CQ-005`, `AG-004` |
| **D-011** | Roles & authorization | **Deferred / out of scope for now.** Identity is handled lightly via `User`/`Team` entities (`WP-009`) for assignment and notification only — no permissions, role-based access, or approval-authority model. May be revisited. |
| **D-012** | Brownfield baseline / ratchet | Existing repos adopt **incrementally**: a committed **baseline** records accepted pre-existing debt; the gate blocks only **new/changed** artifacts and the baseline only shrinks (ratchet). "Consistent" (`VL-012`/D-008) means *clean relative to the baseline*. → `VL-013`, `VL-014` |

**No questions remain open.** Further decisions will be appended to the table above and promoted to decision
records (ADRs, area E) as the system evolves.

---

## 12. Explicit non-goals (boundaries)

These are boundaries, **not** deferred phases — they describe what IBuildOS deliberately will not be.

- **Not a new version control system.** Always git; never a bespoke VCS (the Fossil cautionary tale).
- **Not a new knowledge format.** Always OKF; the format is adopted as-is, not forked or extended.
- **No silent AI writes.** AI never auto-commits to the source of truth; human review is mandatory.
- **Not language/framework/CI prescriptive.** No mandated programming language, test framework, CI
  provider, or editor.
- **Not a hosted system of record.** The repository is the record; any portal/UI/SaaS is a derived,
  optional surface.
- **Not multi-repo (for now).** Scope targets a single repository; cross-repo federation is not pursued
  currently (decision D-005) — it may be revisited, but it is out of scope for this catalog.
- **Not a metrics vanity layer.** Metrics are derived from real artifacts + git, never hand-entered to
  look good.

---

## Appendix A — Coverage map

Every point from the original brief maps to one or more requirements, so nothing is dropped.

| # | Original point (paraphrased) | Requirements |
|---|---|---|
| 1 | End-to-end tools/framework/methodology for agentic software development | Vision §1; principles §3; whole catalog |
| 2 | No vendor / technology lock-in | KS-008, NFR-001, IO-001, IO-006, CQ-003, HS-003, VC-002, VC-008 |
| 3 | All knowledge (reqs, planning, tests) + code in one repo; full SDLC in repo | KS-001..009, RM-*, WP-*, TT-*, §9 |
| 4 | Use Claude Code / Codex / OpenCode to write reqs, plan, generate code | AG-002, AG-006, WP-006, HS-001..006, IN-004 |
| 5 | OpenSpec-inspired specification authoring | SA-001..008, IO-003 |
| 6 | OKF for all non-code information, structured & retrievable | KS-002, KS-005, KS-006, TS-001 |
| 7 | Schema + deterministic CLI linter (no AI); AI for contradictions/missing; defs in OKF; per-project | TS-001..009, VL-001..012, AG-001 |
| 8 | (dup) Record specification per OpenSpec | SA-001..008 |
| 9 | Init CLI: greenfield questions / brownfield understand+restructure; uses harness internally; default templates + workflow | IN-001..009 |
| 10 | Set up skills/commands/`CLAUDE.md`/`AGENTS.md` per framework | HS-001..006 |
| 11 | Bug lifecycle tracked | BG-001..005 |
| 12 | Test lifecycle, manual + automated; run tests from the tool | TT-001..009 |
| 13 | Code linting and docs linting | VL-011 (docs), CQ-001..004 (code) |
| 14 | Measure gaps between actual code, tasks, etc. | GP-001..006, TR-004, TR-005 |
| 15 | Measure plan progress (epics/stories done vs pending) | PM-001..006 |
| 16 | Requirements traceability | TR-001..007, RM-002 |
| 17 | Nice UI to view + author + review + plan + operate (conductor.build-style) | UI-001..014 |
| 18 | Use the agent harness fully but also fast static-analysis tools | GP-001, principle 8, NFR-003 |
| + | "Also use gstack and Conductor knowledge" (stacked diffs + parallel agents) | VC-001..009, UI-006 |
| + | UI as an actionable surface (author, review, plan, operate, agent-assisted editing) + run tests from the tool + default templates/workflow at init | UI-010..014, TT-009, IN-008..009 |
| + | Team awareness & coordination: User/Team entity + assignment, "my plate" CLI, notifications (assignment/review/PR-merge), default assignee, human onboarding, team-memory views | WP-009..011, PM-007, SK-006, HS-007, UI-015..016, VC-010 |
| + | Brownfield team adoption: baseline/ratchet, non-blocking CI, retro traceability backfill, incumbent coexistence, bulk migration, phased rollout, adoption metrics, team change-management | VL-013..014, IN-010..012, IO-007..008, PM-008, HS-008; D-012 |
| D | Decisions (2026-06-30); D-011 defers roles/authz, D-012 baseline/ratchet | D-001..D-012; see §11 |

## Appendix B — Expansions beyond the original brief

Added to round out the vision (and prevent boxing in scope), clearly marked so provenance is transparent:

- **Area E — Architecture & Decision Records.** ADRs, architecture-as-code, runbooks (implied by the
  project vision's architecture/decision/operational artifacts).
- **Area R — Stakeholder Communication.** Generated change summaries, release notes, and status reports.
- **Area S — Interoperability & Migration.** OSLC-aligned links, SDD ingestion, incumbent importers, exports.
- **Area T — Profile Governance & Versioning.** Versioned, shareable, forkable SDLC profiles; pluggable engine.
- **Area U — Version Control Workflow, Stacking & Parallel Agents.** Stacked diffs (Graphite/"gstack") and
  Conductor-style parallel isolated agent workspaces, with stack-aware validation.
- **UI as an actionable surface & init defaults.** Authoring, review, and work-planning in the UI, plus
  running validation/tests/agents and operating the system from the UI (UI-010..014), including
  agent-assisted authoring/editing of artifacts (UI-014); running tests from the tool (TT-009); and default
  artifact templates + a default workflow with CI gates configured at init (IN-008..009).
- **Team awareness & coordination (roles/authorization deferred).** `User`/`Team` identity entities and work
  assignment (WP-009), default assignee per workflow state (WP-010), a personal "my plate" queue via CLI + UI
  (PM-007, UI-015), notifications on assignment/review/PR-merge (SK-006), human onboarding via CLI/UI + docs
  (HS-007), team management/memory views and artifacts (UI-016, WP-011), and human edit contention handled by
  PRs (VC-010). Roles, permissions, and approval authority are explicitly deferred (decision D-011).
- **Brownfield team adoption (the transition into the steady state).** Baseline/ratchet so existing repos
  adopt incrementally (VL-013, decision D-012) with a non-blocking CI mode (VL-014); retroactive traceability
  backfill (IN-010) and bulk migration (IO-008); incumbent coexistence/read-mirror during transition (IO-007);
  phased path-scoped rollout (IN-011); adoption/migration-coverage metrics (PM-008); team change-management
  onboarding (HS-008); and the migration tracked as IBuildOS work (IN-012).
- **Cross-cutting additions.** Staleness detection via an integrated external checker (AG-004, CQ-005),
  change-impact analysis (AG-005), knowledge-base
  health metrics (PM-004), local-first/privacy and security (NFR-006, NFR-007), authoring ergonomics (NFR-008).

## Appendix C — References

- Open Knowledge Format v0.1 — spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>
- Open Knowledge Format — Google Cloud blog: <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing>
- Karpathy gist (knowledge-format inspiration): <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
- OpenSpec (Fission-AI): <https://github.com/Fission-AI/OpenSpec> · concepts: <https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md>
- OpenSpec site: <https://openspec.dev/>
- GitHub Spec Kit: <https://github.com/github/spec-kit>
- AWS Kiro (spec-driven): <https://kiro.dev/>
- Conductor (parallel coding agents): <https://www.conductor.build/> · docs: <https://www.conductor.build/docs>
- Graphite — stacked diffs/PRs ("gstack"): <https://graphite.com/guides/stacked-diffs>
- OSLC (lifecycle traceability standard): <https://open-services.net/>
- MADR (decision records): <https://adr.github.io/madr/>
- C4 model + Structurizr: <https://c4model.com/> · <https://structurizr.com/>
- arc42 (architecture docs): <https://arc42.org/>
- Backstage / TechDocs (portal): <https://backstage.io/>
- Fossil SCM (all-in-one cautionary tale): <https://fossil-scm.org/home/doc/trunk/www/whyallinone.md>

---

*End of specification. This document is an IBuildOS artifact and evolves through the workflow it describes.*