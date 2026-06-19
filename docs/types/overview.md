---
type: Reference
title: SDLC Type Model — Hierarchy, Traceability, and Jira/Confluence Mapping
description: How iBuildOS's artifact types fit together and replace traditional ALM tools.
tags: [types, taxonomy, traceability]
timestamp: 2026-06-18T00:00:00Z
---

# Overview

This profile models the whole lifecycle as linked OKF documents. The types fall
into four groups: **knowledge / requirements** (the Confluence replacement),
**work breakdown** (the Jira issue replacement), **planning** (boards, roadmaps,
versions), and the **abstract bases** that keep them consistent.

# Inheritance

```
WorkItem (abstract: id, title, owner, status)
├── BacklogItem (abstract: + priority, estimate, planned_for→Release, scheduled_in→Sprint)
│   ├── Initiative
│   ├── Epic
│   ├── Story
│   ├── Task
│   ├── Bug
│   └── Spike
├── Requirement (abstract: + status, priority, traces_to→PRD)
│   ├── BusinessRequirement
│   ├── FunctionalRequirement
│   └── NonFunctionalRequirement
├── Subtask
├── Vision · PRD · Persona
└── Release · Sprint · Milestone · Roadmap
```

A relationship whose `target` is an abstract base accepts any subtype — so a link
to an `FR-` document satisfies `target: Requirement`.

# Work-breakdown hierarchy

```
Initiative → Epic → Story → Task → Subtask
                     │
                     └── Bug · Spike  (peers of Story, grouped under an Epic)
```

`parent` links climb the hierarchy (each `max: 1`); `realized_by` is the inverse
view back down it.

# Traceability chain

```
Vision → PRD → BusinessRequirement → Functional / NonFunctional Requirement
                                              │ implements
                    Initiative → Epic → Story → Task → Subtask
                                              │              │ implements
                                              └ verified_by  │
                                                  Test ◄──────┘ verifies
```

From idea to production: a business need (`BR`) is refined into functional and
non-functional requirements, which Epics and Stories `implements`, which break
into Tasks and Subtasks, all `verified_by` Tests. Planning is orthogonal: any
BacklogItem is `planned_for` a Release and optionally `scheduled_in` a Sprint;
Milestones `require` work; Roadmaps `include` Initiatives.

# What replaces what

| Traditional tool | iBuildOS types |
|---|---|
| Confluence — vision, PRDs, requirement pages, personas | Vision, PRD, Business/Functional/NonFunctional Requirement, Persona |
| Jira — initiatives, epics, stories, tasks, sub-tasks, bugs, spikes | Initiative, Epic, Story, Task, Subtask, Bug, Spike |
| Jira — sprints, versions, roadmaps, milestones | Sprint, Release, Roadmap, Milestone |
| Jira test management (Xray, Zephyr) | Test |

Every one of these is a single markdown file with typed frontmatter,
version-controlled in git and validated by iBuild — so the relationships above are
checkable, not aspirational.
