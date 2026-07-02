---
type: ArtifactType
defines: TestResult
description: A captured test-run outcome, stored as a versioned OKF artifact (decision D-009).
fields:
  id:
    required: true
    pattern: "RESULT-<slug>"
    doc: Stable identifier, e.g. RESULT-ci-2026-06-30.
  status:
    required: true
    one_of: [passed, failed, skipped, errored]
    doc: Outcome of the run.
  ran_at:
    type: date
    doc: Date the run was captured.
  runner:
    doc: The command/runner that produced this result.
relationships:
  result_of:
    target: Test
    max: 1
    doc: The Test this result records an outcome for.
---

# TestResult

A **TestResult** is a test-run outcome captured as a version-controlled artifact
rather than a transient CI log (decision D-009). `iBuild test` orchestrates the
project's existing runner and records results here; automated CI results and
manual outcomes both live in the same shape. It is a result record, not a work
item, so it draws no chain findings.
