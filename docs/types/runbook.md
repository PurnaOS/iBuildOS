---
type: ArtifactType
defines: Runbook
extends: WorkItem
description: An operational runbook — release and on-call knowledge.
fields:
  id:
    required: true
    pattern: "RUN-<slug>"
    doc: Stable identifier, e.g. RUN-deploy-rollback.
  status:
    required: true
    one_of: [draft, active, deprecated]
    doc: Document lifecycle.
---

# Runbook

A **Runbook** captures operational knowledge — how to deploy, roll back, or
respond on-call — as a version-controlled artifact next to the code it operates.
