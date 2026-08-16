# iBuildOS

**iBuildOS v2 is a UI-driven application-building platform.** A desktop app
where a product person and an architect define what to build, AI coding
agents build it — several at once, each in an isolated git worktree, driven
over the open [Agent Client Protocol](https://agentclientprotocol.com) — and
everything (requirements, stories, tests, code, decisions) lives as
structured, version-controlled knowledge in one git repo.

> **This repository is currently being rebuilt from a clean slate as v2.**
> The previous CLI-first traceability linter (v0.5, package `ibuildos`) is
> fully preserved at branch [`archive/v1-cli`](../../tree/archive/v1-cli) and
> tag `v1-cli-archive` — its README and USER_GUIDE describe that tool, not
> what's being built here. The v0.5 concepts (OKF storage, self-describing
> type profiles, deterministic validation, typed traceability) carry forward
> into v2's design; no v0.5 code does.

## What v2 is

- A product person **records what the product must do** — guided forms or a
  conversational AI interview — producing structured, versioned requirements.
- Requirements become **stories, tasks, and tests** through AI-assisted
  breakdown the human reviews and approves.
- **AI coding agents build it** — several at once, each isolated — driven
  entirely from the UI through ACP, so any capable coding agent (Claude Code,
  Codex CLI, …) can do the work.
- The person **watches the product take shape live**: running previews,
  passing tests, progress against requirements — and can **change
  requirements mid-flight**, with the system computing impact and re-planning.
- Every fact is a version-controlled **OKF document in the repo** — the
  project outlives the tool.

The full specification lives in [`docs/spec/`](docs/spec/) — start with
[`SPEC.md`](docs/spec/SPEC.md).

## Status

Early build — see [`docs/spec/EXECUTION-PLAN.md`](docs/spec/EXECUTION-PLAN.md)
for the milestone sequence (M0 Foundations → M8 Delivery). What exists today:

- `packages/schemas` — zod types for the OKF artifact/type-profile/config/
  generative-UI-component formats FORMATS.md defines.
- `packages/engine` — the OKF store (byte-preserving parse/serialize), the
  type-profile registry, and a first slice of the deterministic rule engine.
- `packages/stub-agent` — a scripted ACP agent (real JSON-RPC/stdio, no live
  model) that later milestones' tests drive against instead of a live model.
- Everything else under `packages/*` and `apps/desktop` is a placeholder
  boundary, populated milestone by milestone.

## Development

```sh
pnpm install
pnpm typecheck   # turbo run typecheck, every package
pnpm test        # turbo run test, every package
```

## License

See [LICENSE](LICENSE).
