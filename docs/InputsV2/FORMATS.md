---
type: FormatSpecification
title: "iBuildOS — FORMATS: The Normative Serialization Annex (Build-Ready Kit #1)"
description: >-
  The bytes. Every on-disk format, wire contract, naming scheme, and identifier grammar the
  SPEC describes behaviorally, defined concretely enough that an autonomous builder writes
  code — and every format here is a public, versioned compatibility surface under the
  open-core commitment (NFR-016). Closes all 18 FORMAT stalls in BUILD-READINESS.md.
status: draft
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, formats, serialization, build-ready-kit]
---

# FORMATS — Normative Serialization Annex

**Authority.** Where SPEC.md defines *behavior*, this annex defines *bytes*. A conflict is a
bug in this annex (the SPEC wins on intent). Every format here is versioned as **formats/1**;
breaking changes bump the major and require a migration note (KB-011 applies to formats as it
does to profiles). Keywords *shall/should/may* as in SPEC §0.

**Conformance artifacts.** The builder shall commit, under `packages/engine/fixtures/`, one
golden example of every format in this annex plus invalid counter-examples per rule; the
engine's conformance suite round-trips them byte-stable. The examples in this annex are
normative and become those fixtures.

---

## 1. OKF stance (D-116)

- **Target: OKF v0.2** (the live spec; SPEC Appendix C's v0.1 citation is corrected in v1.2).
- **Workflow lifecycle uses the `state` key**, not `status`. OKF v0.2 reserves `status:
  draft | stable | deprecated` (absent ⇒ `stable`); iBuildOS does not write `status` at all in
  shipped profiles (projects may; the engine treats it as an ordinary optional field with
  OKF's vocabulary).
- **Provenance maps onto OKF v0.2 fields** (satisfies RQ-013): agent-produced or agent-revised
  artifacts carry `generated: { by, at }` where `by` is the agent identity string (§10) and
  `at` is ISO-8601 UTC. Origin material (interview capture, imported docs) is recorded in
  `sources:`. The coarse origin classification lives in our own `provenance` key (enum:
  `human | agent | imported | backfilled`) — one word, filterable.
- **Cross-linking:** normative typed links live in the frontmatter `links:` block (§4) and
  reference **artifact IDs**, not paths. Bodies may additionally contain ordinary markdown
  links for OKF-native navigation; the engine rewrites body links when files move, but only
  frontmatter links are validated (VG-001).
- Bundles remain permissively consumable: unknown types/fields tolerated (KB-008), UTF-8, LF.

## 2. Artifact identifiers

**Grammar (final IDs):** `<PREFIX>-<NNNN>` — uppercase prefix from the table below, hyphen,
zero-padded 4-digit number (expands to 5+ digits past 9999 without re-padding existing IDs).
Numbers are per-prefix, append-only, never reused (SPEC RQ-002/KB-007). Case-insensitive on
input, canonical uppercase on write.

| Prefix | Type | Prefix | Type |
|---|---|---|---|
| PB | ProductBrief | TC | TestCase |
| RQ | Requirement (Functional & NonFunctional) | SU | TestSuite |
| EP | Epic | TR | TestResult |
| ST | Story | CH | Change |
| TA | Task | RN | Run |
| BG | Bug | RV | Review/Approval |
| SK | Spike | CM | Comment |
| DC | Decision (ADR) | DP | Deploy |
| AR | Architecture | RL | Release |
| RB | Runbook | MS | Milestone |
| PS | Persona | SP | Sprint |
| DD | DesignDirection | US | User |
| NT | MeetingNote/StandupLog/RetroAction | TM | Team |

**Criterion references:** acceptance criteria are list items in a required body section (§4),
each carrying an inline ID `[AC-n]` unique within the artifact. External reference syntax:
`ST-0042#AC-2`. Criterion IDs are append-only within an artifact (deleting a criterion retires
its number).

**Provisional IDs (KB-010):** artifacts created inside a stream use
`<PREFIX>-p<nonce>-<n>` — literal `p`, the stream's 4-char base36 nonce (§11), and a per-stream
counter starting at 1. Example: `TC-pa3f9-2`. Rules:

1. Provisional IDs are valid link targets *within the stream's branch*; the engine resolves
   them normally there.
2. **Finalization is performed by the merge queue, the single allocator per landing** (SPEC
   KB-010): at landing time it assigns the next free final number per prefix (in queue order),
   then rewrites every occurrence of each provisional ID — frontmatter links, body text, and
   criterion references — across **the files changed by the landing**, in the same commit
   (IG-009 atomicity). Filenames rename accordingly (§3); `git mv` preserves history.
3. Rule `id/provisional-on-trunk` (severity **error**, bound to the `merge` gate) fails any
   landing that would leave a provisional ID on trunk; rule `id/duplicate` (error, `merge` and
   `validate`) fails duplicate final IDs; rule `id/format` (error) enforces the grammar.

## 3. File naming & bundle layout

**Filenames are the ID, lowercase: `st-0042.md`.** No slug in the filename — OKF v0.2 defines a
concept's identity as its path, and titles change; ID-only names make renames rare and identity
stable. The title lives in frontmatter.

**Default bundle root: `docs/`** (configurable, KB-004 via `ibuildos.yaml`). Directory per
type family:

```
docs/
├── brief/          pb-*        ├── tests/         tc-*, su-*
├── requirements/   rq-*        ├── results/       tr-*
├── epics/          ep-*        ├── changes/       ch-*
├── stories/        st-*        ├── runs/          rn-*
├── tasks/          ta-*        ├── reviews/       rv-*, cm-*
├── bugs/           bg-*, sk-*  ├── releases/      rl-*, dp-*, ms-*, sp-*
├── decisions/      dc-*        ├── team/          us-*, tm-*
├── architecture/   ar-*, rb-*  ├── coordination/  nt-*        (profile-toggled)
├── personas/       ps-*        ├── design/        dd-*  (+ attached assets)
├── profile/        one .md per TypeDefinition (§5) + gates.yaml (§6)
├── skills/         skill packages (§13)
└── commands/       command definitions (§13)
```

Attachments (RQ-011) live beside their artifact in `docs/<dir>/assets/<id>/…` and are
referenced by relative markdown links in the body.

## 4. Artifact frontmatter

**Common keys (every artifact):**

| Key | Req | Form | Notes |
|---|---|---|---|
| `type` | yes | string | OKF-required; a TypeDefinition's `defines` name |
| `id` | yes | ID grammar §2 | canonical uppercase |
| `title` | yes | string | free text; not part of identity |
| `state` | yes | string | from the type's state vocabulary (D-116) |
| `owner` | yes | User/Team ID | `US-…`/`TM-…` |
| `provenance` | yes | enum | `human \| agent \| imported \| backfilled` |
| `created` | yes | ISO-8601 date | set once |
| `links` | no | map | §below |
| `assignee` | work types | User/Team ID | TM-003 |
| `generated` | when agent-produced | `{by, at}` | OKF v0.2; §1 |
| `sources` | optional | OKF v0.2 list | origin material |
| `tags` | optional | string list | free |
| `external` | optional | list of `{system, ref, url?}` | BF-007 external_ref |

**The `links` block** — one map keyed by relationship name, values always **arrays of IDs**
(or `ID#AC-n` for criterion targets), even when a single entry:

```yaml
links:
  implements: [RQ-0007]
  depends_on: [ST-0041]
  verified_by: [TC-0031, TC-0032]
  honors: [DD-0001]
```

**Type-specific keys (beyond common):** Story/Task/Bug/Epic/Spike: `estimate` (number, opt),
`priority` (`p1|p2|p3`, opt), `claim` (`{by, machine, at}`, written by BD-017, cleared at
landing) · Task: `code` (list of repo-relative globs), `component` (contract component name,
TP-009) · Bug: `severity` (`blocker|major|minor`), `repro` in body · TestCase: `kind`
(`manual|automated`), `binding` (automated: `{file, pattern?}` test-file path + optional
name filter) · TestSuite: members via `links.member_of` inverse (cases carry `member_of`) ·
Requirement: `kind` (`functional|nonfunctional`) · Release: `target_date` (opt) · Deploy/
TestResult/Run/Review: §9. Everything else is profile-extensible (KB-004).

**Required body sections** are declared per type (§5). Acceptance-carrying types (Requirement,
Story) require:

```markdown
## Acceptance criteria
- [AC-1] A field engineer can save an inspection with no connectivity.
- [AC-2] Saved inspections sync automatically within 30 s of connectivity returning.
```

**Worked example — a complete Story file (`docs/stories/st-0042.md`):**

```markdown
---
type: Story
id: ST-0042
title: "Offline inspection capture"
state: building
owner: US-0001
assignee: US-0001
provenance: agent
created: 2026-08-14
estimate: 3
priority: p1
generated: { by: "claude-code/claude-agent-acp@0.66.0", at: 2026-08-14T09:12:00Z }
links:
  implements: [RQ-0007]
  depends_on: [ST-0041]
  verified_by: [TC-0031, TC-0032]
  honors: [DD-0001]
claim: { by: US-0001, machine: "srinis-mbp", at: 2026-08-14T09:15:02Z }
---

As a field engineer, I capture an equipment inspection with no network and trust it will sync.

## Acceptance criteria
- [AC-1] An inspection saves fully offline (verified by [TC-0031](../tests/tc-0031.md)).
- [AC-2] Sync completes within 30 s of connectivity returning ([TC-0032](../tests/tc-0032.md)).

## Notes
Conflict policy per [DC-0003](../decisions/dc-0003.md): newest edit wins, user notified.
```

## 5. The type-profile dialect (KB-003/004)

One markdown file per type in `docs/profile/`, frontmatter-only (body = documentation). The
engine natively knows only this meta-format.

**Worked example — `docs/profile/story.md` (normative for the dialect):**

```yaml
---
type: TypeDefinition
defines: Story            # the type name artifacts use
extends: WorkItem         # inherits fields/links/states; overrides merge by key
abstract: false
prefix: ST                # ID prefix (§2)
dir: stories              # bundle directory (§3)
fields:                   # beyond inherited; key = frontmatter key
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
states:
  vocabulary: [draft, ready, queued, building, review, accepted, done, rejected, retired]
  initial: draft
  transitions:            # absent pair = illegal transition (rule state/legal)
    - { from: draft,    to: ready,    gate: story-ready }
    - { from: ready,    to: queued,   gate: plan }
    - { from: queued,   to: building }
    - { from: building, to: review,   gate: stream-done }
    - { from: review,   to: accepted, approval: acceptance }   # dial-waivable (D-115)
    - { from: review,   to: building }                          # request changes
    - { from: review,   to: rejected }
    - { from: accepted, to: done,     gate: merge }
    - { from: [accepted, done], to: review }                    # CH-005 re-verification
    - { from: "*",      to: retired }
  derived: false          # true for Requirement post-ready states (RQ-008)
links:
  implements: { target: [Requirement], min: 1 }
  depends_on: { target: [Story, Task], cycles: forbid }
  verified_by: { target: [TestCase], min: 1 }
  honors:     { target: [DesignDirection] }
  parent:     { target: [Epic], max: 1 }
body:
  sections:
    - { name: "Acceptance criteria", required: true, items: AC }  # items ⇒ [AC-n] IDs
json_schema: null         # escape hatch (KB-004): inline JSON Schema applied to frontmatter
---
Story: a user-valued slice of a requirement. See SPEC area ST.
```

Dialect semantics: `extends` merges by key (child wins); `abstract: true` forbids direct use;
field `kind` ∈ `string | number | boolean | date | enum | id | list<...>`; `pattern` (regex)
and `required` per field; link constraints: `target` (type names, abstract allowed —
polymorphic per SPEC KB), `min`/`max`, `cycles: forbid`; `states.derived: true` marks
states the engine computes (RQ-008) — hand-edits to derived states are rule violations.
**Meta-validation** (KB-006, rule `profile/meta-valid`): unknown `extends`, unknown link
target, unreachable state, or transition referencing an undefined gate fail with file+key.
The profile records its version in `docs/profile/profile.md`
(`{ name, version, formats: 1 }`) — the value VG-012 pins.

## 6. Rules & gates

**Canonical rule registry (formats/1).** Rule IDs are frozen; new rules append. Default
severities shown (per-project overridable, VG-003).

| Rule ID | Checks | Default |
|---|---|---|
| `doc/field-required` | required frontmatter keys present | error |
| `doc/field-kind` | field value matches declared kind/enum/pattern | error |
| `doc/section-required` | required body sections present | error |
| `doc/criteria-items` | criteria section items carry unique `[AC-n]` | error |
| `doc/body-link` | body markdown links resolve in-repo | warn |
| `id/format` · `id/duplicate` · `id/provisional-on-trunk` | §2 | error |
| `link/target-exists` | every `links` ID resolves | error |
| `link/target-type` | target's type ∈ declared `target` set | error |
| `link/cardinality` | min/max respected | error |
| `link/cycles` | `cycles: forbid` links acyclic | error |
| `state/vocabulary` | `state` value ∈ type vocabulary | error |
| `state/legal` | last transition ∈ declared transitions | error |
| `state/approved` | transitions declaring `approval` have a Review artifact (incl. dial-waived) | error |
| `state/derived` | derived states not hand-edited | warn |
| `chain/req-unimplemented` | ready+ Requirement with no implementing Story | warn |
| `chain/story-untested` | Story without passing `verified_by` evidence | error@merge |
| `chain/task-no-code` | done Task whose `code` globs match nothing | error |
| `chain/code-unlinked` | source file (in adopted scope) no Task references | info |
| `chain/done-honest` | VG-007 composite: done ⇒ merged code + passing tests + intact chain | error |
| `chain/bug-regression` | Bug fix merging without a `verifies`-Bug TestCase (ST-009) | error@merge |
| `merge/superseded` | stream's Story already done on trunk (BD-017) | error@merge |
| `merge/ordered-resource` | ordered-resource change merging out of queue order (IG-011) | error@merge |
| `sec/committed-secret` | high-entropy/known-pattern secrets in tracked files + known keychain values | error |
| `evid/tests-passing` | bound TestResults green at the evaluated commit | error@gates |
| `evid/stale` | evidence older than policy allows relative to commit | warn |
| `contract/valid` | ibuildos.yaml parses, commands exist (post-TOFU, TP-005/008) | error |
| `contract/trusted` | contract hash matches trusted hash | error |
| `profile/meta-valid` | §5 | error |
| `pin/engine` · `pin/profile` | VG-012 recorded pins match evaluator | error (CI) / warn (UI) |
| `guidance/stale` | exported AGENTS.md older than profile/house-rules change (EX-010) | warn |
| `docs/todo-marker` | unresolved `TODO(ibos)` markers in artifacts | warn |

**Gate compositions — `docs/profile/gates.yaml`:**

```yaml
formats: 1
gates:
  requirement-ready: [doc/*, id/*, link/*, state/vocabulary]
  story-ready:       [doc/*, id/*, link/*, state/*, doc/criteria-items]
  plan:              [story-ready, chain/req-unimplemented, link/cycles]
  stream-stage:      [doc/*, id/*, link/*, state/*, evid/tests-passing]
  stream-done:       [stream-stage, chain/done-honest?scope=stream, sec/committed-secret]
  merge:             [stream-done, id/duplicate, id/provisional-on-trunk, merge/*,
                      chain/bug-regression, sec/committed-secret, pin/*]
  release-deploy:    [merge?scope=release, evid/*, chain/story-untested?scope=release]
```

Syntax: a gate lists rule IDs, `prefix/*` globs, other gate names (composition), and
`?scope=` modifiers (`stream | release | changed | all`). This file is data (EX-004).

## 7. Project configuration — `ibuildos.yaml`

One file at repo root; the only non-`docs/` config artifact. Machine/user secrets never appear
here (PV-005). Full schema by example (all sections optional except `project` + `engine`):

```yaml
formats: 1
project:
  id: 01J9XW4E7NQZ4T8KD2M5B3YHVA        # ULID, generated once, never changes (PS-014)
  name: "Field Inspections"
engine: ">=1.0.0 <2.0.0"                # VG-012 pin (semver range or exact)
profile: { name: ibuildos-default, version: 1.0.0, path: docs/profile }
bundle: { root: docs }
template: { name: web-app, version: 1.2.0 }          # TP-007 provenance
policies:                                # DEFAULTS.md overrides live here
  dial: cruise
  sync: { fetch_minutes: 5, push_on_landing: true }
  pr_per_stream: false                   # IG-005
  mismatch: { ui: warn, ci: refuse }     # VG-012
contract:
  components:                            # single-component projects may inline
    web:                                 #   these keys at contract top level
      paths: ["app/**", "lib/**"]
      commands:                          # argv arrays, never shell strings
        dev:     ["pnpm", "dev"]
        test:    ["pnpm", "test"]
        lint:    ["pnpm", "lint"]
        seed:    ["pnpm", "db:seed"]
        migrate: ["pnpm", "db:migrate"]
        build:   ["pnpm", "build"]
      preview: { url: "http://localhost:{port}", ready: { path: "/", status: 200 } }
      ordered: [{ name: migrations, paths: ["drizzle/**"], command: migrate }]   # IG-011
      safe: [test, lint]                 # AC-006 auto-approved for agents
  deploy:
    staging:
      component: web
      command: ["vercel", "deploy", "--prebuilt"]
      auth: { secrets: [VERCEL_TOKEN], connect: vercel-login }   # DR-008
environments:                            # names + non-secret defaults only (PV-005)
  local:      { vars: { DATABASE_URL: "file:./dev.db" } }
  staging:    { vars: {}, secrets: [VERCEL_TOKEN, STRIPE_TEST_KEY] }   # names only
agents:                                  # AC-008 role assignment
  default: claude-code
  roles: { resolver: codex, test_author: pi }
mcp:                                     # AC-009 passthrough
  - { name: design-system, command: ["npx", "acme-ds-mcp"] }
```

- `{port}` in `preview.url` is allocated by the app and injected as `PORT`.
- **Contract trust (TP-008):** the trusted hash = SHA-256 of the canonical JSON of the
  `contract` section (sorted keys, no insignificant whitespace), stored machine-local per
  project id. Hash change ⇒ re-confirmation before any command runs; streams that modify
  `ibuildos.yaml` or files referenced by contract commands trigger the TP-008 approval path.

## 8. Baseline — `.ibuildos/baseline.json` (committed)

```json
{
  "formats": 1,
  "engine": "1.0.0",
  "profile": "ibuildos-default@1.0.0",
  "generated": "2026-08-14T10:00:00Z",
  "scope_events": [
    { "at": "2026-08-14", "added_paths": ["src/legacy/**"], "entries": 214 }
  ],
  "entries": [
    { "rule": "chain/story-untested", "artifact": "ST-0012", "fp": "9f2ab4c1d0e88a37" }
  ]
}
```

**Fingerprint (VG-008), exact:** `fp = hex(sha256(rule_id + "\0" + artifact_id + "\0" +
subject))[:16]`, where `subject` is the stable finding subject — the field key, link
relationship name, criterion ID, or glob string the finding concerns — **never** line
numbers, messages, or file paths. Robust to edits elsewhere in the file; two findings on the
same rule+artifact+subject are one baseline entry. Ratchet: `entries` may only shrink except
via a recorded `scope_events` addition (BF-005/G-19).

Committed-but-not-in-docs state lives under `.ibuildos/` (baseline, gates cache manifest);
machine-local state lives in app storage keyed by project ULID — never in the repo.

## 9. Flow-record frontmatter (beyond §4 common keys)

| Type | Keys |
|---|---|
| **Run** (`RN-…`) | `agent` (identity string §10) · `role` (AC-008 role) · `stream` (nonce or `-`) · `subject` (list: ST/TA/CH/BG IDs or `merge`/`adoption`/`interview`) · `started`/`ended` (ISO) · `outcome` (`done\|failed\|aborted\|superseded`) · `gates` (map gate→`green\|red`) · `transcript` (machine-local URI: `ibos-transcript://<project-ulid>/<RN-id>.jsonl`) · body = agent summary (the cross-machine audit record, AC-012) |
| **Review** (`RV-…`) | `subject` (ID) · `verdict` (`accepted\|changes\|rejected\|waived`) · `mode` (`product\|engineering\|dial-waived`) · `commit` (sha) · `criteria` (map `AC-n`→`pass\|fail\|waived`) · comments as `CM-…` children (`links.parent`) |
| **TestResult** (`TR-…`) | `subject` (TC or SU ID) · `commit` · `verdict` (`pass\|fail\|skip`) · `kind` (`automated\|manual`) · `cases` (suite runs: map TC→verdict) · `evidence` (relative asset links) |
| **Deploy** (`DP-…`) | `target` · `environment` · `commit` · `by` (US) · `url` (opt) · `outcome` · `links.result_of: [RL-…]` |
| **Change** (`CH-…`) | `links.affects` · body sections `## Why`, `## Before`, `## After`, `## Re-plan` (the applied change-set summary) |

**Transcript JSONL** (machine-local, secret-redacted): one event/line:
`{"t": ISO, "kind": "message|thought|tool_call|tool_result|permission|component|answer|system",
"role": "agent|user", "data": {...}}` — `data` carries the raw ACP payload for
message/thought/tool events; `component`/`answer` carry §10 envelopes.

## 10. Agent identity & the component-emission convention (GU-012)

**Agent identity string:** `<agent>/<adapter>@<version>` — e.g.
`claude-code/claude-agent-acp@0.66.0`, `codex/codex-acp@1.2.0`, `pi/pi-acp@0.0.33` — used in
`generated.by`, Run records, and commit trailers.

**Component emission — two carriers, one envelope.**

*Envelope (versioned with the GU catalog):*

```json
{ "v": 1, "kind": "decision-card", "cid": "q1",
  "title": "Sync conflict policy?",
  "body": "Two devices can edit the same inspection offline.",
  "options": [ { "id": "newest", "label": "Newest edit wins", "consequence": "…" },
               { "id": "ask",    "label": "Ask the user",      "consequence": "…" } ],
  "recommend": "newest" }
```

`kind` ∈ catalog v1: `question-form | decision-card | plan-tree | change-set | progress |
review-summary` (schemas in `packages/schemas`, unknown kinds render generic per GU-009).

*Carrier A (preferred) — the bundled MCP UI server:* iBuildOS passes every session (AC-009) a
built-in MCP server `ibuildos-ui` exposing tools `ui_emit_component(envelope)` and
`ui_request_secret({name, reason})` (AC-013). Tool-call = structured, attributable, ACP-visible.

*Carrier B (fallback) — fenced block in the message stream:* a fenced code block with info
string `ibuildos:component` containing the envelope JSON. The bridge extracts it from streamed
`session/update` message chunks; agents that emit neither get prose (GU-002 fallback).

*Answers* return in the next `session/prompt` as a fenced `ibuildos:answer` block:
`{"v":1,"cid":"q1","response":{"choice":"newest"}}` — plus a natural-language restatement so
non-convention agents still understand. Secret requests never carry values in either
direction (AC-013): the answer is `{"granted": true, "env": "STRIPE_TEST_KEY"}` and the value
is injected out-of-band.

## 11. Git conventions

- **Stream branches:** `ibos/<work-id-lower>-<nonce>` (`ibos/st-0042-a3f9`); nonce = 4-char
  base36, generated at stream start, reused as the provisional-ID nonce (§2). Integration
  worktrees: `ibos/merge-<seq>`.
- **Commit trailers** (GH-004): every app-made commit ends with
  `Co-authored-by: <Agent Display Name> <agent@ibuildos.local>` (when agent-authored),
  `iBuildOS-Agent: claude-code/claude-agent-acp@0.66.0`, `iBuildOS-Run: RN-0113`,
  `iBuildOS-Stream: st-0042/a3f9`. Human-only commits carry no agent trailers.
- **Landing commits** additionally: `iBuildOS-Lands: ST-0042` and, when IDs were finalized,
  `iBuildOS-Finalized: TC-pa3f9-2=TC-0033,…`.

## 12. CLI, findings JSON & GitHub Action

**Package `@ibuildos/cli`, bin `ibuildos`** (DEFAULTS #13). Commands (formats/1 surface):

```
ibuildos validate [path] [--changed | --base <ref>] [--baseline] [--format text|json]
ibuildos gate <name> [--commit <sha>] [--format text|json]
ibuildos baseline write | show
ibuildos rules | gates | instructions <Type>
ibuildos graph export [--format json] | matrix [--format json|csv]
```

**Exit codes:** `0` clean or warnings-only · `1` errors · `2` usage error · `3` engine/profile
pin mismatch (refusal, VG-012) · `4` internal fault. `--annotate-only` forces exit 0 on
findings (VG-010 non-blocking mode).

**Findings JSON (stable schema, VG-003/VL machine output):**

```json
{ "formats": 1, "engine": "1.0.0", "profile": "ibuildos-default@1.0.0",
  "commit": "abc123", "gate": "merge",
  "findings": [ { "rule": "link/target-exists", "severity": "error",
                  "artifact": "ST-0042", "subject": "verified_by",
                  "message": "TC-0099 does not exist", "fix": "…", "fp": "9f2a…" } ],
  "summary": { "errors": 1, "warnings": 0, "info": 2, "baselined": 14 } }
```

**GitHub Action** (`ibuildos/validate-action@v1`): inputs `command` (default `validate`),
`gate`, `annotate-only` (bool), `working-directory`; reads the repo's `engine` pin and installs
that CLI version; outputs `errors`, `warnings`; annotates via workflow commands.

## 13. Templates, skills & commands

**Template manifest — `template.yaml` at template root:** `{ formats: 1, name, version,
engine: <range>, description, contract: <§7 contract section>, profile: <name@version or
path>, environments, deploy: <targets with auth declarations>, seed_note }`. Project creation
copies the scaffold, writes `ibuildos.yaml` (`template:` provenance), and runs the TP-003
guarantee check. Template updates arrive as change-sets (TP-007).

**Skill — `docs/skills/<name>/skill.md`:** frontmatter `{ type: Skill, name, version,
applies_to: { roles: […], types: […] }, scope: read-only }`, body = the instruction text
injected into matching sessions (EX-002); additional files in the folder ride along.
**Command — `docs/commands/<name>.md`:** frontmatter `{ type: Command, name, params: {…},
run: [argv] | playbook: <skill name>, scope: read-only|worktree-write|network|deploy }`
(EX-003/009). Scope gates execution through the AC-006 policy.

---

## 14. Format versioning

Every file this annex defines carries `formats: 1` (or is versioned via the profile/catalog it
belongs to). The engine refuses files with a higher major than it knows (with the VG-012
message), tolerates lower with migration offered (KB-011). This annex is itself an iBuildOS
artifact; changes flow through review like everything else.

*End of FORMATS annex (formats/1).*
