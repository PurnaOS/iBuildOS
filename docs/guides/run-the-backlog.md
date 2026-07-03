# User guide — letting iBuild complete the work

iBuild doesn't just track requirements, work, and tests anymore: it can execute
the backlog with a coding agent, with every piece of state — the queue, the
claims, the audit log — living in the repo as OKF artifacts and git commits.
There are two ways to run it:

| Mode | What it is | When to use |
|---|---|---|
| `iBuild run` | One agent, one task at a time, driven by the binary | Simple backlogs, cron/CI, any harness (Claude Code, Codex, …) |
| `/run-backlog` | A whole Claude Code agent team (lead, design, implementers, QA, bug-fixer, design-review, PM) | Bigger builds where roles and browser QA matter |

Both are **operator modes**: unlike the suggest-only `/ibuild-*` skills, they
commit locally per task. Neither can push — you review the final diff.

---

## 1. Prerequisites

```bash
iBuild init . --full        # new project (or add agent.md/agent-run.md to docs/types/ on an existing one)
iBuild validate .           # must exit 0 — the executor refuses a broken baseline
git status                  # must be clean — the clean tree is what makes failure recovery safe
```

Your backlog must exist as artifacts: Tasks (`status: todo`) that `implements`
a requirement, and that requirement at `status: accepted`. **Flipping a
requirement from `draft`/`proposed` to `accepted` is the scheduling act** —
draft backlogs yield an empty queue on purpose. `iBuild run --dry-run` shows
exactly what the executor would pick, in order.

## 2. Quickstart — `iBuild run`

```bash
iBuild run . --dry-run      # preview the ready queue, touch nothing
iBuild run . --once         # complete ONE task, commit it, stop
iBuild run .                # drain: keep going until no ready tasks remain
```

Per task, the loop:

1. **Selects** the best ready task: `todo`, traced to an accepted requirement
   (directly or via parent), ordered by `priority` (must → should → could),
   ties by path.
2. **Claims** it by flipping `status: in_progress` — the claim is repo state,
   not a lock file.
3. **Prompts** the agent with: the role charter (an `Agent` artifact body),
   the task, its linked requirement/parent/tests from the graph, the AGENTS.md
   contract, and the completion contract (set `done`, wire `code:` globs +
   `verified_by:` a passing Test, run validate, never commit).
4. **Spawns** the configured harness as a subprocess with a per-task timeout.
5. **Gates**: `iBuild validate` must report 0 errors, the task must actually be
   `done` (which forces real code globs + a passing test through the chain
   rules), and your project's test command must exit 0. Failed gate → the
   agent gets the exact failure report and retries (default: once).
6. **Records + commits**: an `AgentRun` artifact lands in `docs/work/runs/`
   and one commit `run(TASK-0042): <title> [ARUN-…]` becomes the ledger entry.

### Flags

```
iBuild run [path]
  --once            one task then stop (the cron/heartbeat unit)
  --watch           keep polling for newly-ready tasks
  --max N           stop after N tasks
  --task TASK-0042  pin one specific task (id or /work/... key)
  --role <r>        role key into run.roles (default: implementer)
  --timeout <min>   per-task kill timer (default 30; escalates TERM → KILL)
  --interval <sec>  watch poll interval (default 300)
  --dry-run         print the queue, change nothing
  --no-commit       strict suggest-only: do the task, leave it uncommitted, stop
  --reclaim         reset stale in_progress claims from a dead run back to todo
```

Exit codes: 0 = drained / nothing ready, 1 = a task failed or preflight
refused, 2 = usage.

### Configuration (`.ibuildos.yaml`)

```yaml
harness:                      # any coding-agent CLI — this is the whole adapter
  name: claude
  command: claude
  args: ["-p", "{prompt}", "--permission-mode", "acceptEdits"]
  # Codex example: command: codex, args: ["exec", "{prompt}"]

tooling:
  test: bun test              # the gate runs this after every task

run:                          # all optional; defaults shown
  max_tasks: 0                # 0 = unlimited
  task_timeout: 30            # minutes per task
  retries: 1                  # re-prompts with the gate's failure report
  commit: true                # false = suggest-only, one task per invocation
  on_failure: stop            # stop = leave the tree for you; skip = revert, mark task blocked, continue
  role: implementer
  roles:
    implementer: /agents/agent-implementer.md   # role → charter artifact
  records_dir: work/runs
  gate_test: true
  agent_active_statuses: [active]   # paused/retired agents refuse to spawn
```

### Agents are artifacts

An agent is a file in `docs/agents/` (`iBuild instructions Agent` for the
template). **The body is the charter** — it becomes the top of every spawn
prompt, so the prompt that drives your agent is versioned, reviewable, and
diffable like everything else:

```markdown
---
type: Agent
id: AGENT-implementer
name: Implementer
role: implementer
status: active          # paused benches it; retired keeps history
links:
  reports_to: [/agents/agent-lead.md]   # org chart, derived
---
Claim a task, read its linked requirement, implement code + real tests, ...
```

### Failure handling

- **Retry**: each failed gate re-prompts the agent with the exact validate
  errors / test output. Partial work is kept between attempts.
- **`on_failure: stop`** (default): the working tree is left exactly as the
  agent left it — failed work is evidence for you to inspect. Exit 1.
- **`on_failure: skip`** (for unattended runs): the attempt is reverted, the
  task flips to `blocked`, the failed `AgentRun` is committed, and the loop
  moves on. Blocked tasks are never re-selected until you reset them.
- **Timeout**: SIGTERM, then SIGKILL after 5s. Recorded as `aborted`.
- **Crash/dead session**: state is git + frontmatter. Re-run with `--reclaim`
  to reset stale `in_progress` claims and continue.
- The executor stops before any claim if the tree got dirty since the last
  task (your mid-run edits are never swept into an agent commit or reverted).

### Heartbeat / unattended operation

`--once` is the cron unit:

```
0 * * * * cd /path/to/repo && /path/to/iBuild run --once >> .run.log 2>&1
```

Or run `--watch` on a dedicated machine. Budget with `--max` /
`run.max_minutes`.

## 3. The agent team — `/run-backlog`

For a full multi-role build, open Claude Code in the repo and type
`/run-backlog` (installed by `iBuild init` at `.claude/commands/`). The lead
agent then:

1. Writes team permissions to `.claude/settings.local.json` (allowlist,
   `git push` denied, a TaskCompleted hook that blocks task completion while
   `iBuild validate` has errors).
2. Arms an hourly watchdog cron that restarts a stalled run headless.
3. Reads the roster from `docs/agents/` (seeds the default seven roles if
   empty) and spawns teammates: design first, then implementers sized to the
   independent work streams, QA (browser personas), PM; bug-fixer and
   design-review on demand.
4. Drives each Epic through the pipeline: design-ready → implement → QA →
   design-review → bugs resolved → PM objective check.

Claiming a task is one commit: task `in_progress` + `assignee` link + a
`running` AgentRun with a `heartbeat` timestamp the teammate keeps updating.

## 4. Watching progress (all derived — nothing hand-maintained)

| Where | What you see |
|---|---|
| `iBuild serve` | Studio UI — Tasks/Bugs/Agents flipping live |
| `iBuild status .` | JSON health: implemented/verified/traced counts |
| `iBuild run . --dry-run` | what's next in the queue |
| `git log --oneline docs/work/runs/` | the event log — one entry per run |
| `docs/work/runs/*.md` | each run's outcome, attempts, harness log tail |
| `git log` | the ledger: one commit per completed task |

## 5. When it finishes

```bash
iBuild validate .        # 0 errors = chain complete
iBuild status .
git log --oneline        # review the ledger
git diff main --stat     # nothing was pushed — the review is yours
```

Every commit is one task plus its audit record; revert any of them
independently. Push when satisfied.

## 6. Safety model, in one breath

Human schedules (requirement → `accepted`) → agent executes → deterministic
gate proves it (validate + tests) → repo records it (AgentRun + commit) →
human reviews before push. No lock files, no databases, no hidden state — if
you can read git, you can audit the whole run.
