---
type: ArtifactType
defines: Team
extends: Actor
description: A group of Users that work can be assigned to.
fields:
  id:
    required: true
    pattern: "TEAM-<slug>"
    doc: Stable identifier, e.g. TEAM-platform.
relationships:
  members:
    target: User
    doc: The Users on this team.
---

# Team

A **Team** groups [User](user.md)s. Work can be assigned to a Team (via a work
item's `assignee`) the same way it is assigned to an individual, because both
extend [Actor](actor.md).
