---
type: Reference
title: How to Approach Building a Git-Native SDLC OS on OKF
description: Strategy, critical review, architecture, and a phased MVP plan for a solo, part-time, open-source builder.
tags: [strategy, okf, sdlc, architecture, roadmap]
timestamp: 2026-06-18T00:00:00Z
---

# How to Approach This

A strategy note for building the Git-Native Software Development Operating System as a **solo, part-time, open-source** effort. Written 2026-06-18.

> This document is itself written as a conformant OKF concept (frontmatter + markdown) — dogfooding from line one.

---

## 0. The one reframe that changes everything

The vision treats OKF ("Open Knowledge Format") as a foundation you'll "leverage." Six days ago that foundation became real: **Google Cloud published OKF v0.1 on 2026-06-12** (authored by Sam McVeety and Amir Hormati). It's exactly what your vision describes — a directory of markdown files with YAML frontmatter, distributed as git "bundles," readable by humans and agents.

But read its **non-goals** carefully. OKF explicitly refuses to:

- define a fixed taxonomy of concept types (it has one required field, `type`, and no registry of values),
- type its relationships (a link from A to B is an *untyped* markdown link; the meaning lives in prose),
- enforce anything (conformance is permissive — consumers MUST tolerate unknown types, missing fields, and broken links).

That is the whole game. OKF gives you the **substrate** — format, frontmatter, bundles, links, git-native distribution — and deliberately leaves out **the SDLC**: the type taxonomy (PRD, ADR, Epic, Task…), the typed traceability links (implements, traces-to, verified-by…), and the validation that turns a pile of markdown into a checkable knowledge graph.

So the project is not "build a Confluence + Jira replacement." It is:

> **An SDLC profile on top of OKF, plus a validation/traceability engine, plus (later) a portal.**

That reframe is narrower, genuinely novel (OKF is 6 days old — nobody has built this yet), defensible without a new format war, and small enough for one person to start this weekend.

---

## 1. The landscape — what already exists, and the gap you fill

You are not in empty territory. Almost every *piece* of your vision exists as mature prior art. The opportunity is the **connective tissue**, not the pieces.

| Layer | Best existing prior art | What it gives you | Why it's not the whole job |
|---|---|---|---|
| Knowledge substrate | **OKF v0.1** (Google Cloud, 2026-06-12) | markdown+frontmatter, bundles, git distribution, untyped links | No SDLC taxonomy, no typed links, no validation |
| Artifact authoring | **Spec-Driven Development**: GitHub Spec Kit (Spec→Plan→Tasks→Implement), AWS **Kiro** (`requirements.md` in EARS, `design.md`, `tasks.md`), BMAD, Tessl, OpenSpec | Generates the PRDs/specs/plans/tasks for you, AI-native | Per-feature and ephemeral; no repo-wide graph, no cross-artifact validation, no traceability over time |
| Decisions | **MADR** / adr-tools / Log4brains | Markdown ADRs, already a docs-as-code convention | Just one artifact type; no links to requirements/tests |
| Architecture | **C4 model + Structurizr DSL**, **arc42** | Architecture-as-code, diagrams from a model, doc structure | Stops at architecture; not wired into traceability |
| Specs/contracts | **Gherkin**, **OpenAPI/AsyncAPI**, JSON Schema | Machine-readable behavior and interface specs | Format-specific; no project-wide knowledge graph |
| Portal/catalog | **Backstage** (CNCF incubating, 3,400+ companies — Netflix, IKEA, Expedia), TechDocs, MkDocs Material | Searchable docs-as-code portal + software catalog | Heavy to run; portal is the *last* mile, not your wedge |
| Traceability standard | **OSLC** (RDF / Linked Data ALM standard) | The "correct" model: typed links across requirements↔changes↔tests | Enterprise, RDF, heavyweight — failed to win broad adoption because it's complex |
| All-in-one ancestor | **Fossil SCM** (VCS + wiki + tickets + docs + forum in one file) | Proof the "everything in the repo" idea works | Its *own* VCS, not git → niche adoption despite great engineering |

**The gap nobody owns yet:** a *lightweight, git-native, OKF-conformant* layer that adds a **typed SDLC taxonomy** and a **fast traceability/validation linter** over the markdown that SDD tools already generate. Think "OSLC's traceability model, but as a markdown convention + a linter you can drop into CI" — riding the brand-new OKF substrate and the 2025–26 spec-driven wave.

---

## 2. Critical review of the vision (the hard truths)

The vision is excellent as a north star and dangerous as a starting point. Five things to internalize:

**2.1 It's six products, not one.** Replacing Confluence + Jira + ADR tooling + requirements management + a docs portal + a stakeholder-comms platform is a 5-year roadmap for a *funded team*. Solo and part-time, your enemy is scope, not competitors. The single highest-leverage decision you'll make is what to **cut**. (See §3–4: cut the portal, the agent fleet, the comms platform, and the graph viz from v1.)

**2.2 The moat of the incumbents is not technical.** Jira and Confluence are not winning on quality — they win on incumbency, integrations, and *manager/PM workflows* (boards, sprints, reporting that non-engineers live in). A git-native system is strictly better for engineers and strictly worse for the VP who wants a burndown chart. Be honest that your near-term users are **AI-forward solo devs and small teams already doing docs-as-code / spec-driven development** — not enterprises migrating off Jira. Don't design v1 for a buyer you can't reach.

**2.3 Fossil is your cautionary tale.** It did "the entire SDLC in the repo" twenty years ago, beautifully, and stayed niche — because it asked teams to abandon git. Your one non-negotiable: **be git-native and tool-agnostic.** Meet people in the repos and CI they already have. Never ask them to switch VCS, and never require your portal to get value.

**2.4 "Self-healing documentation" is the flashiest goal and the most likely to destroy trust.** An AI that silently rewrites your source of truth is a liability the first time it's confidently wrong. The credible version is **detect-and-propose**: agents open PRs and comment on gaps, humans merge. Auto-commit to main should never be on the table. Build the validation layer first (deterministic, trustworthy); add AI as a *suggester* on top of it.

**2.5 Authoring ergonomics decide whether the graph rots.** Humans will not hand-maintain frontmatter and a link graph by hand for long. Either the AI maintains links, or scaffolding/templates make it nearly free, or the graph decays and your validator just nags. Treat authoring UX as a first-class feature, not an afterthought.

**What's genuinely defensible and cheap to win:** an **open spec + a fast linter**. Specs and linters punch far above their weight in OSS mindshare — see MADR, Conventional Commits, EditorConfig, semantic-release. They're small enough for one person, they attract contributors, and they create a standard others build on. That, not the portal, is your wedge.

---

## 3. Technical architecture (lean, standards-first)

Design principle: **adopt at every layer you can, and only build the connective tissue.** Five layers, but you build ~1.5 of them.

**Layer 0 — Substrate: OKF (adopt as-is).** Do not modify or fork the format. Every artifact is an OKF concept: a markdown file with YAML frontmatter, in a bundle, distributed via git. Staying conformant means Google's and others' OKF consumers can already read your repo for free.

**Layer 1 — The SDLC Profile, as self-describing type definitions (your spec, your core IP).** This is the thing OKF refuses to define — but rather than write it as JSON Schema off to the side, define each artifact type as an OKF document a human can read. The validator hardcodes nothing about "Task" or "PRD"; it knows only how to read a type definition, so a project defines its own lifecycle just by editing markdown in its repo. The profile becomes *data*, not code. Three parts:

- *Type taxonomy* — a set of types mapping to the lifecycle: `Vision`, `PRD`, `BusinessRequirement`, `FunctionalSpec`, `ADR`, `Epic`, `Task`, `Test`, `Runbook`, `Release`. Each is one `ArtifactType` document in the `docs/types/` bundle (the knowledge bundle root is `docs/`, configured in `.ibuildos.yaml`). (Reuse existing per-type conventions inside the body: MADR for `ADR`, EARS/Gherkin for requirements, C4/Structurizr refs for architecture.)
- *A friendly, human-readable schema dialect* — each definition declares its `fields` (`required`, `one_of`, `pattern`) and `relationships` (`target`, `min`/`max`) in plain YAML that reads like documentation. The tool compiles this to JSON Schema internally, so you keep JSON Schema's validators and editor autocomplete without anyone hand-authoring it. A `json_schema:` escape hatch covers what the tiny dialect can't express — which also stops the dialect from slowly reinventing all of JSON Schema, badly.
- *Typed traceability links* — because OKF links are untyped, a definition's `relationships` declare typed links that documents fill in under a `links:` block:

```yaml
links:
  implements:  [/requirements/req-0007.md]
  verified_by: [/tests/test-orders-freshness.md]
```

Because each relationship names a `target` type, the engine checks not just that a link resolves but that it points to a document of the right type and cardinality. This is essentially OSLC's link model as a readable markdown convention instead of RDF — the lightweight version of a heavyweight idea. Ship a base profile of type definitions; projects `extends`, override, or replace them to fit their own process.

**Layer 2 — Validation & traceability engine (your MVP heart).** A single distributable CLI (also a GitHub Action and pre-commit hook). Deterministic rules only:

- required artifacts exist for a given scope,
- frontmatter conforms to the rules in its type definition (compiled to JSON Schema under the hood),
- every typed link resolves to a real concept *of the type and cardinality its definition requires*,
- ownership is present,
- the traceability chain is complete (no Requirement without a Task, no Task without a Code ref or Test, no orphans),
- output a machine-readable report and a non-zero exit code in CI.

Derive the knowledge graph *at build time* by walking frontmatter links — no graph database, no server. Emit JSON/GraphML so a viz can come later.

**Layer 3 — AI knowledge agents (later; suggest-only).** Gap detection, staleness (compare a doc's `timestamp` against `git blame` of the code it references), conflict detection, and draft generation (PRD/ADR from a diff). Delivered as **PRs and PR comments**, never auto-merges. Implement as commands compatible with the SDD tools your users already run (Spec Kit, Kiro, Claude Code), so you ride their harness instead of building one.

**Layer 4 — Portal (later; borrow, don't build).** Point MkDocs Material or Backstage TechDocs at the same files. Both already do full-text search and docs-as-code rendering. Your only addition is a traceability/graph view fed by Layer 2's JSON export.

**Stack choices for one part-time person:** pick *one* language for a single-binary CLI — Go or TypeScript (npm + Homebrew) for easy distribution; Python only if it's mostly AI glue. Parse with off-the-shelf markdown + frontmatter libraries (`remark`/`gray-matter`, or `goldmark`). Validate with JSON Schema. Ship the GitHub Action first — it's the lowest-friction way for anyone to adopt you.

**Interop is a feature:** stay OKF-conformant (free reach into the OKF ecosystem), align your link vocabulary with OSLC concepts (credibility + a migration story for enterprises later), and be able to *ingest* Kiro/Spec-Kit output (`requirements.md`, `design.md`, `tasks.md`) so SDD users get traceability for artifacts they already produce.

---

## 4. Phased plan — each phase ships something useful on its own

The sequencing rule: **spec → linter → templates → AI → portal.** Every phase is independently valuable, so you always have something to show and nothing waits on the giant end-state.

**Phase 0 — Write the spec (a weekend).** Publish *"OKF-SDLC Profile v0.1"*: the type taxonomy, per-type frontmatter, and the typed-link convention. Ship it as an OKF bundle (your spec repo is itself OKF-conformant). A clear spec is a shareable artifact that attracts contributors before you've written a line of product code.

**Phase 1 — MVP: the traceability linter (the thin vertical slice).** Validate exactly **one** chain end-to-end: `Requirement → Task → Code-ref → Test`. Ship `iBuild validate` as a CLI + a GitHub Action that comments traceability gaps on PRs. Dogfood it on its own repo. Positioning: *"a traceability linter for spec-driven repos."* This alone is a complete, useful, novel product.

**Phase 2 — Breadth + ergonomics.** Add the remaining artifact types (ADR via MADR, architecture via C4/Structurizr references, releases). Add `init`/scaffold templates so authoring is near-free (attacks risk 2.5). Add `graph` JSON export and a one-command MkDocs preset.

**Phase 3 — AI assist (suggest-only).** Missing/stale/conflicting detection and draft generation as PRs. Integrate with Spec Kit / Kiro so you consume artifacts users already generate.

**Phase 4 — Only if there's traction.** Portal/graph visualization, the stakeholder-comms generator, multi-repo/federation, and an enterprise OSLC bridge.

**Adoption strategy for a solo OSS maintainer:** ride the OKF news wave while it's days old (be the canonical "SDLC-on-OKF" project), target the SDD/AI-dev crowd where the behavior already exists, keep adoption to a single GitHub Action, publish the spec to recruit co-authors, and dogfood in public so the repo is its own best demo.

---

## 5. Do this week

1. Claim the niche: repo + name + the *OKF-SDLC Profile v0.1* spec, written as an OKF bundle.
2. Pick the one traceability chain for the MVP linter (recommend Requirement → Task → Code → Test).
3. Stand up the CLI skeleton + per-type JSON Schemas + a GitHub Action that fails on a broken chain.
4. Manage this project's own backlog and ADRs as OKF-SDLC documents — your first user is you.

---

## References

- Open Knowledge Format v0.1 spec — https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- Google Cloud, "How the Open Knowledge Format can improve data sharing" — https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/
- GitHub Spec Kit — https://github.com/github/spec-kit
- Martin Fowler, "Understanding Spec-Driven Development: Kiro, spec-kit, and Tessl" — https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- Backstage — https://backstage.io/docs/overview/what-is-backstage/
- Fossil SCM, "Why Add Forum, Wiki, and Web Software To Your DVCS?" — https://fossil-scm.org/home/doc/trunk/www/whyallinone.md
- OSLC (Open Services for Lifecycle Collaboration) — https://open-services.net/
- MADR / arc42 / C4 + Structurizr — https://docs.arc42.org/section-9/ , https://structurizr.com/
