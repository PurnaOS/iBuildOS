---
type: ArtifactType
defines: User
extends: Actor
description: A contributor, mapped to a git user identity. Lightweight identity for assignment and notification — not auth.
fields:
  id:
    required: true
    pattern: "USER-<slug>"
    doc: Stable identifier, e.g. USER-srini.
  git_email:
    doc: The git identity (email) this user maps to, so artifacts and changes attribute via git history.
  handle:
    doc: Optional chat/VCS handle.
---

# User

A **User** is a contributor identity that maps to a git user (name + optional
email/handle). An artifact's `owner` field and a work item's `assignee` link
resolve to a User, so authorship and assignment attribute to real people via git
history rather than depending on `CODEOWNERS`. Roles, permissions, and approval
authority are out of scope.
