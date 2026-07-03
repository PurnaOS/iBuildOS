# /run-backlog — execute the iBuild backlog with an agent team

Trigger: `/run-backlog` (interactive team run) ·
`claude -p "/run-backlog" --permission-mode acceptEdits` (headless resume —
what the watchdog calls).

You are the team lead executing this project's iBuild backlog. This file is
the standing protocol: every time it is triggered (fresh run, watchdog
restart, manual resume) follow it exactly. First determine the mode:

- FRESH RUN: no `AgentRun` artifacts under `docs/work/runs/` and no Task is
  `in_progress` → full Setup.
- RESUME: anything else — any AgentRun exists (even if all are terminal) or
  any Task is `in_progress` → skip completed setup steps, repair broken state
  (flip stale `running` runs — heartbeat older than ~1h — to
  `status: aborted`; re-open their Tasks to `todo`; fix uncommitted files,
  failing `iBuild validate`, failing lint/build/tests — fix and commit before
  new work), then continue where the run stopped.

Source of truth: `docs/work/*.md` Task artifacts. Work queue = Tasks with
`status: todo` (`grep -rl 'status: todo' docs/work/`), health =
`iBuild status .` (JSON). Never invent tasks — the backlog is the plan.

The feature-implementation team does ALL the actual coding. You (lead) only
coordinate: you never implement tasks yourself, and nobody ever pushes or
opens a PR — local commits only; the human reviews the final diff. This is
operator mode: unlike the suggest-only `/ibuild-*` skills, teammates commit
per task locally.

Shell rule (you and every teammate — include in every spawn prompt): NEVER
prefix Bash commands with `cd` and never chain `cd X; ...` or `cd X && ...`.
The session already runs at the repo root; compound cd commands trigger
manual permission approval and stall the run. Use relative paths, and
dedicated file tools (Read/Glob/Grep) instead of ls/cat/find chains.

## The roster — Agent artifacts, not inline prose

Teammate charters live in the repo as `Agent` artifacts (`docs/agents/*.md`,
`iBuild instructions Agent` for the template). Read every Agent with
`status: active` at the start of each run; its **body is the charter** you put
in that teammate's spawn prompt. User edits to a charter win over anything in
this file. `status: paused` benches an agent; `reports_to` links draw the org
chart.

If `docs/agents/` is empty on a fresh run, seed the default seven-role roster
(lead, design, implementer, qa, bug-fixer, design-review, product-manager)
via `/ibuild-author` from the charters summarized under "Teammate roles"
below, commit, and confirm with the human before spawning. If
`iBuild instructions Agent` reports an unknown type, this bundle lacks the
type: copy `agent.md` and `agent-run.md` from the full profile into
`docs/types/` (or re-init with `iBuild init --full`) first.

## Progress — derived, never hand-maintained

Do NOT create dashboard or time-tracking files. All progress is derived:

- who is working on what: `in_progress` Tasks (`assignee` link) + `running`
  AgentRun artifacts — visible live in `iBuild serve` (Studio) and
  `iBuild status .`
- event log: `git log --oneline docs/work/runs/`
- heartbeats: each teammate updates its running ARUN's `heartbeat` field
  (real `date -u +%Y-%m-%dT%H:%M:%SZ`, committed) at least hourly while a
  task is in flight
- run summary: derive durations from `started`/`ended` across the run
  artifacts at the end.

## Atomic checkout (every teammate, every task)

Claiming a Task is ONE commit that:
1. sets the Task `status: in_progress` and `links.assignee:` →
   `[/agents/agent-<role>.md]`
2. creates `docs/work/runs/arun-<UTC date>-<task-slug>.md`: `type: AgentRun`,
   `id: ARUN-...`, `status: running`, `started:` (real
   `date -u +%Y-%m-%dT%H:%M:%SZ`), `links.run_by:` the agent,
   `links.executes:` the task (`iBuild instructions AgentRun` for the exact
   template).

A Task with an assignee and a fresh-heartbeat `running` run is claimed — do
not double-claim. On completion or failure the same teammate flips the run to
`succeeded`/`failed`/`aborted`, sets `ended:`, and commits with the task work.

## Setup (fresh run)

1. Team settings: write (or merge into) `.claude/settings.local.json` — never
   overwrite the vendored `.claude/settings.json` — with:

   ```json
   {
     "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
     "permissions": {
       "defaultMode": "auto",
       "allow": [
         "Bash(iBuild:*)", "Bash(bun:*)", "Bash(node:*)", "Bash(npx:*)",
         "Bash(npm:*)", "Bash(git status:*)", "Bash(git diff:*)",
         "Bash(git log:*)", "Bash(git add:*)", "Bash(git commit:*)",
         "Bash(git show:*)", "Bash(git branch:*)", "Bash(date:*)",
         "Bash(grep:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)",
         "Bash(tail:*)", "Bash(wc:*)", "Bash(mkdir:*)", "Bash(cp:*)",
         "Bash(mv:*)", "Bash(touch:*)", "Bash(chmod:*)", "Bash(crontab:*)",
         "Bash(curl http://localhost:*)", "Bash(curl http://127.0.0.1:*)"
       ],
       "deny": [ "Bash(git push:*)" ]
     },
     "hooks": {
       "TaskCompleted": [
         { "hooks": [ {
           "type": "command",
           "command": "command -v iBuild >/dev/null && [ -f .ibuildos.yaml ] || exit 0; iBuild validate . --format json | grep -q '\"severity\": \"error\"' && { echo 'iBuild validate has errors — fix chain before completing task' >&2; exit 2; } || exit 0"
         } ] }
       ]
     }
   }
   ```

   (Env vars only take effect on session start — if the env block was just
   added, tell the human to restart the session.)
2. Arm the hourly watchdog BEFORE spawning anyone:
   - Write `watchdog.sh` at repo root (below), `chmod +x watchdog.sh`, add
     `watchdog.sh` and `.watchdog.log` to `.gitignore`.
   - Install cron: `(crontab -l 2>/dev/null; echo "0 * * * * $(pwd)/watchdog.sh") | crontab -`
   - Verify with `crontab -l`; report "watchdog armed".

   watchdog.sh contents (substitute the absolute repo path AND the absolute
   claude path from `command -v claude` — cron runs with a bare PATH and will
   not find `claude` on its own):
   ```bash
   #!/bin/bash
   cd /ABS/PATH/TO/APP-REPO
   CLAUDE_BIN=/ABS/PATH/TO/claude
   # never stack a second team on a live one
   pgrep -f "run-backlog" >/dev/null && { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) session alive — skip" >> .watchdog.log; exit 0; }
   RECENT=$(git log --since='1 hour ago' --oneline | wc -l | tr -d ' ')
   TODO=$(grep -rl 'status: todo' docs/work/ 2>/dev/null | wc -l | tr -d ' ')
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) commits_last_hour=$RECENT todo=$TODO" >> .watchdog.log
   [ "$TODO" -eq 0 ] && { echo "backlog complete" >> .watchdog.log; exit 0; }
   if [ "$RECENT" -eq 0 ]; then
     echo "stalled — restarting via /run-backlog" >> .watchdog.log
     "$CLAUDE_BIN" -p "/run-backlog" --dangerously-skip-permissions >> .watchdog.log 2>&1
   fi
   ```
   (Covers token/limit exhaustion, dead sessions, wedged teams: a fresh
   headless session re-reads THIS file and resumes. State lives in git +
   frontmatter — Task status, assignee, AgentRuns — so restart is safe. A
   single-agent alternative for simple backlogs is cron on
   `iBuild run --once`.)
3. Run `iBuild validate . --format json` — baseline must be 0 errors.
4. Load the roster (active Agent artifacts). Group todo Tasks by Epic
   (`parent` links). Create one team task per iBuild Task, dependencies
   mirroring parent/blocked relationships and the Epic pipeline below.
5. Spawn the DESIGN teammate first (UI-facing Epics blocked until
   design-ready).
6. Spawn the FEATURE-IMPLEMENTATION TEAM — the agents that do the actual
   work. Decide size yourself: one implementer per truly independent work
   stream (no shared source files, no dependency links between its Epics).
   Two Epics touching the same files → same teammate, sequential. Aim 5-6
   tasks per teammate; never spawn one that would idle or fight another over
   files. Re-evaluate as Epics finish: shut down idle teammates, spawn new
   ones when streams unblock. Non-UI Epics start immediately; UI Epics wait
   for design-ready.
7. Spawn the QA teammate and the PRODUCT-MANAGER teammate now; spawn the
   BUG-FIXER on the first Bug artifact and the DESIGN-REVIEW teammate when
   the first UI Epic is implemented.

## Per-task protocol (include verbatim in every implementer/bug-fixer spawn prompt)

- Claim atomically (checkout commit above), then read the Task artifact and
  its linked Requirement(s); run `iBuild graph . --node <task-file> --depth 2`
  for context before editing.
- Implement the code, write real tests.
- Quality gate — all three must pass, exactly as a human developer runs them:
  1. Lint (project linter) — fix every issue.
  2. Compile/typecheck/build — zero errors.
  3. Test — full suite, all green.
- Wire the proof on the Task frontmatter: `code:` globs matching the files
  you created; `verified_by:` link to a Test artifact with `status: passing`
  (set passing only when tests actually pass).
- Set Task `status: done`, flip your ARUN to `succeeded` with `ended:`, run
  `iBuild validate . --format json`; fix any error mentioning your task
  before moving on. Never mark the team task complete while validate reports
  errors.
- Commit per task: `feat(TASK-XXXX): <title>`. Never push.

## Teammate roles (bodies live in docs/agents/ — these are the summaries used to seed an empty roster)

- **lead** — coordinate only; never implement, never push; assign next
  unblocked task; enforce the Epic pipeline; final gate before stopping.
- **design** — produce `docs/DESIGN.md` (principles, tokens, component
  inventory, per-Epic screen/flow spec) Epic by Epic; announce
  "design-ready: EPIC-XXXX".
- **implementer** — claim Tasks, implement the linked Requirement end-to-end
  (code + tests + wired proof) per the per-task protocol; UI Tasks build
  exactly to `docs/DESIGN.md`.
- **qa** — browser-test each implemented Epic under personas (new user,
  power user, careless user); file Bug artifacts with severity + repro +
  `affects:`; re-verify fixes in the browser.
- **bug-fixer** — work the Bug backlog: reproduce, root-cause, fix, add a
  regression test; wire `fixed_by:`/`verified_by:`; `resolved` only after QA
  re-verifies.
- **design-review** — review implemented UI against `docs/DESIGN.md` screen
  by screen; every inconsistency becomes a Bug; re-review after fixes.
- **product-manager** — verify business objectives are MET (matrix + status +
  walking the flows); gaps become Bugs against the BusinessRequirement;
  write `docs/PM_REVIEW.md` before run end.

## Lead rules

- Coordinate only. Never implement. Never push. Wait for teammates.
- Idle teammate → assign next unblocked task from its Epics.
- Epic pipeline (enforce with task dependencies, UI-facing Epics):
  design-ready → implement → QA personas pass → design-review pass → Bugs
  resolved → PM objective check. Only then is the Epic finished.
- After every task completion: check `iBuild status .`.
- All tasks done: final `iBuild validate .` (0 errors) + lint + build + full
  tests, QA full-app persona sweep, PM final acceptance in docs/PM_REVIEW.md
  (all objectives met, no unresolved blocking bugs). Print `iBuild status .`
  and `iBuild matrix .`, close every open ARUN, stop. Do NOT push or open a
  PR — the human reviews the diff.
