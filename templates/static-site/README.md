# iBuildOS static-site template

A minimal [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com) static
site, scaffolded by iBuildOS (`docs/spec/TECH-STACK.md` T-012). This is a real,
working project, not a mockup:

- `src/pages/index.astro` — homepage
- `src/content/posts/hello-world.md` + `src/content.config.ts` +
  `src/pages/posts/[slug].astro` — a content collection with one entry,
  rendered as a static page
- `src/styles/global.css` — Tailwind, wired via `@tailwindcss/vite`
- `tests/build-output.test.ts` — asserts on the real `dist/` output of
  `astro build` (homepage content, the post page, and a generated,
  non-empty Tailwind stylesheet)

## Commands

```sh
pnpm install
pnpm dev       # starts a dev server (defaults to http://localhost:4321)
pnpm build     # writes static output to dist/
pnpm preview   # serves the built dist/ output
pnpm test      # builds, then runs the Vitest suite against dist/
pnpm lint      # astro check (type-checks .astro files)
```

`dev`/`preview` honor a `PORT` env var (falls back to 4321) — this is how
iBuildOS's `{port}` allocation in `preview.url` (`template.yaml`/
`ibuildos.yaml`) reaches the actual server.

**If you're running this template from inside a checkout of the iBuildOS
monorepo** (rather than a project generated from it, or this directory
copied out on its own), `pnpm install` walks up and finds the monorepo's
`pnpm-workspace.yaml`; since `templates/*` isn't a listed workspace member,
plain `pnpm install` here is a silent no-op (no error, no `node_modules`).
Use `pnpm install --ignore-workspace` in that case. A project generated
from this template, or this directory extracted as its own repo, has no
ancestor `pnpm-workspace.yaml` and needs no flag.
