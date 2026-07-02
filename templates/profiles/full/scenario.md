---
type: ArtifactType
defines: Scenario
extends: WorkItem
description: A single GIVEN/WHEN/THEN acceptance scenario in RFC 2119 language — an executable contract for a requirement.
fields:
  id:
    required: true
    pattern: "SCEN-<slug>"
    doc: Stable identifier, e.g. SCEN-orders-lag-alert.
  status:
    required: true
    one_of: [draft, accepted, verified]
    doc: draft (written), accepted (agreed), verified (a passing test proves it).
  given:
    doc: Precondition — the "GIVEN" clause.
  when:
    doc: Trigger — the "WHEN" clause.
  then:
    required: true
    doc: Expected outcome with an RFC 2119 keyword — the system SHALL / MUST / SHOULD / MAY …
relationships:
  verifies:
    target: Requirement
    min: 1
    doc: The requirement this scenario makes concrete (the same relationship a Test uses).
  verified_by:
    target: Test
    doc: The automated test that proves this scenario passes.
---

# Scenario

A **Scenario** is one GIVEN/WHEN/THEN acceptance condition stated in RFC 2119
language — the `#### Scenario:` block of a spec, promoted to a first-class,
linkable graph node. It sits between a [Requirement](requirement.md) (which it
`verifies` — makes concrete) and a [Test](test.md) (`verified_by` — which proves
it).

Because the completeness check counts *any* `verifies` edge toward a requirement
being verified, a Scenario makes requirements verifiable through human-readable
acceptance criteria — with no engine change. Use a Scenario when a criterion
deserves to be traced to a test; for a quick inline definition-of-done, the
`acceptance_criteria` list on [Story](story.md) is enough.

State the `then` with an RFC 2119 keyword so the obligation is unambiguous:

> GIVEN an order older than the freshness SLA
> WHEN the staleness check runs
> THEN the system MUST raise a freshness alert within 60 seconds
