# Artifact Types — core profile

The lean SDLC profile: the **Requirement → Task → Code → Test** chain and a couple
of common helpers. Each file is an `ArtifactType` document whose frontmatter drives
the validator — edit them and the linter follows with zero code change.

# Meta & base

* [ArtifactType](artifact-type.md) - the meta-type; defines the dialect itself
* [WorkItem](work-item.md) - abstract base: id, title, owner, status

# The chain

* [Requirement](requirement.md) - a statement of need the system must satisfy
* [Task](task.md) - the smallest unit of executable work (produces `code`)
* [Test](test.md) - a check that `verifies` a requirement

# Common helpers

* [Story](story.md) - an optional user-facing grouping above tasks
* [Bug](bug.md) - a defect that `affects` a requirement

## Want more?

This is the core profile. For the full SDLC taxonomy — Vision, PRD, the
Business/Functional/NonFunctional requirement split, Initiative/Epic, planning
(Release/Sprint/Milestone/Roadmap), Spike, Persona, and the Change/Scenario change
overlay — run `iBuild init --full`, or copy the type files you want from the full
profile. Adding a type is pure data: drop its `*.md` here.
