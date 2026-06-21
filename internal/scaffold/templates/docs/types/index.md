# Artifact Types

The SDLC profile for this project — the type definitions iBuild validates. Each
file is an `ArtifactType` document: human-readable docs whose frontmatter drives
the validator. Editing these changes what the linter enforces; nothing about the
types is hardcoded in the tool. See [overview](overview.md) for how they fit
together and map onto Jira and Confluence.

# Meta & bases

* [ArtifactType](artifact-type.md) - the meta-type; defines the dialect itself
* [WorkItem](work-item.md) - abstract base: id, title, owner, status
* [BacklogItem](backlog-item.md) - abstract: adds priority, estimate, release/sprint planning
* [Requirement](requirement.md) - abstract base for the three requirement kinds

# Knowledge & requirements (replaces Confluence)

* [Vision](vision.md) - product strategy
* [PRD](prd.md) - product requirements document
* [BusinessRequirement](business-requirement.md) - a need in business terms
* [FunctionalRequirement](functional-requirement.md) - a behaviour the system must provide
* [NonFunctionalRequirement](non-functional-requirement.md) - a quality attribute / constraint
* [Persona](persona.md) - a representative user

# Work breakdown (replaces Jira issues)

* [Initiative](initiative.md) - top-level strategic objective
* [Epic](epic.md) - large body of work
* [Story](story.md) - user story
* [Task](task.md) - smallest unit of executable work
* [Subtask](subtask.md) - fine breakdown of a task
* [Bug](bug.md) - a defect
* [Spike](spike.md) - time-boxed research
* [Test](test.md) - a check that verifies a requirement

# Planning (replaces Jira boards & roadmaps)

* [Roadmap](roadmap.md) - sequences initiatives over time
* [Release](release.md) - a shippable version
* [Sprint](sprint.md) - a time-boxed iteration (optional)
* [Milestone](milestone.md) - a dated checkpoint
