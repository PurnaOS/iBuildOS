---
type: ArtifactType
defines: Agent
extends: Actor
description: An autonomous agent identity — a role charter the executor spawns; assignable to work like any Actor.
fields:
  id:
    required: true
    pattern: "AGENT-<slug>"
    doc: Stable identifier, e.g. AGENT-qa.
  status:
    required: true
    one_of: [active, paused, retired]
    doc: Whether the orchestrator may spawn this agent. Pause to bench it; retire keeps history.
  role:
    required: true
    doc: Orchestrator role key, e.g. lead, implementer, qa. A free string — roles are project-defined, never an engine vocabulary.
  harness:
    doc: Harness label for this agent (e.g. claude, codex). Advisory — orchestration kits may route on it; `iBuild run` always spawns the configured harness (AG-006).
relationships:
  reports_to:
    target: Agent
    max: 1
    doc: Escalation / org-chart line; the lead sits at the root. The org chart is derived by walking these links.
---

# Agent

An **Agent** is an autonomous identity that work can be assigned to. It extends
[Actor](actor.md), so a WorkItem's `assignee` relationship accepts an Agent
exactly as it accepts a [User](user.md) or [Team](team.md) — the checkout
surface needs no new machinery.

The **body is the charter**: mission, boundaries, and the per-task protocol the
agent follows. `iBuild run` and the `/run-backlog` team kit read the charter as
the spawn prompt, so the prompt that drives an agent is repo-native, validated,
reviewable, and diffable (AG-008, AG-010). Agents live in the bundle (e.g.
`agents/`), and every run they perform is recorded as an
[AgentRun](agent-run.md).
