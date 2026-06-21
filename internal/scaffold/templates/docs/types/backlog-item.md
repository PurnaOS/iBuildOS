---
type: ArtifactType
defines: BacklogItem
extends: WorkItem
abstract: true
description: Abstract base for any schedulable, prioritisable unit of work.
fields:
  priority:
    one_of: [must, should, could, wont]
    doc: MoSCoW priority.
  estimate:
    doc: Effort estimate (story points, t-shirt size, or hours) — the team picks the unit.
relationships:
  planned_for:
    target: Release
    max: 1
    doc: The release this item is slated for.
  scheduled_in:
    target: Sprint
    max: 1
    doc: The sprint this item is scheduled in. Optional under flow-based planning.
---

# BacklogItem

An abstract base — never used directly — for work that can be prioritised,
estimated, and placed on a plan: [Initiative](initiative.md), [Epic](epic.md),
[Story](story.md), [Task](task.md), [Bug](bug.md), and [Spike](spike.md) all
extend it. It adds `priority` and `estimate` to the [WorkItem](work-item.md)
basics, plus the optional planning links `planned_for` (a [Release](release.md))
and `scheduled_in` (a [Sprint](sprint.md)).

Because planning links live here, every kind of work item plugs into the same
release and sprint plan without re-declaring how.
