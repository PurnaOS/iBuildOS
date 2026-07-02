---
name: ibuild-audit
description: >
  Audit traceability: run the deterministic iBuild linter, find gaps in the
  Requirement→Task→Code→Test chain (orphan requirements, untested done-tasks,
  broken or mistyped links, code globs that match nothing), and propose minimal
  edits to close them. Use when the user says "audit traceability", "check the
  chain", "find gaps", "what's missing", "run iBuild", or "is everything linked".
  Detect-and-propose only — it never applies edits or commits on its own.
---

# iBuild Audit

Find traceability gaps and propose fixes. The deterministic linter is the
authority; this skill adds the human "why" and concrete edits — then stops.

## Procedure

1. **Delegate to the auditor subagent.** Launch the `ibuild-traceability-auditor`
   agent (it is read-only and runs `iBuild validate`/`iBuild graph`). It returns a
   structured report: linter counts, gaps, proposed fixes, and items needing a
   human decision.
2. **Present the report** to the user as-is — gaps with their chain rationale, and
   proposed frontmatter edits.
3. **Apply only on approval.** If the user approves a proposed fix, make that edit
   (or hand it to `/ibuild-author`), then re-run `iBuild validate .` to confirm
   the error is gone. Never apply edits the user hasn't approved.

## Boundaries

- The auditor never edits, never commits. This skill applies edits only with
  explicit user approval, one at a time, re-validating after each.
- `iBuild validate` is the source of truth for whether a gap is real. If the
  linter is green, do not invent gaps.
