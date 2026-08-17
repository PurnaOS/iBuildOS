# Deploy notes

Nothing sensitive here — just a description of the deploy flow.

The `web` component builds with `pnpm build` and deploys via the `staging`
target. Secrets are referenced by name only (see `environments.staging.secrets`
in ibuildos.yaml) and their values live in the machine-local secret store.
