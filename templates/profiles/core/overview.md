---
type: Reference
title: Core Type Model — the lean Requirement → Task → Code → Test chain
description: The minimal iBuildOS profile and how its few types fit together.
tags: [types, taxonomy, traceability, core]
---

# Overview (core profile)

The core profile is deliberately small: one requirement type, the work that
implements it, and the test that proves it — plus two optional helpers.

# Inheritance

```
WorkItem (abstract: id, title, owner, status)
├── Requirement   (status, priority)
├── Task          (code, implements→Requirement, verified_by→Test)
├── Test          (verifies→Requirement)
├── Story         (optional grouping: implements→Requirement, verified_by→Test)
└── Bug           (affects→Requirement, verified_by→Test)
```

# Traceability chain

```
Requirement ──implements──◄ Task ──code──► [source files]
     ▲                        │
     └────────verifies──── Test ◄──verified_by──┘
```

A Requirement is `implemented` by a Task (directly, or via a `parent` Story) and
`verified` by a Test. The gate refuses a `done` Task whose `code` matches nothing
or whose Test isn't `passing`, and an `accepted` Requirement that nothing
implements or verifies.

# Growing beyond core

Everything here is data. When the flat model isn't enough, `iBuild init --full`
gives you the full taxonomy (Vision/PRD, the requirement split, Initiative/Epic,
planning, Spike/Persona, and the Change/Scenario overlay). You can also add any
single type by dropping its `*.md` into this directory — no code change.
