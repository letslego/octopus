---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `octopus run`

One-command bootstrap and start:

```sh
pnpm octopus run
```

Does:

1. Auto-onboards if config is missing
2. Runs `octopus doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
npx octopus run --instance dev
```

## `octopus onboard`

Interactive first-time setup:

```sh
pnpm octopus onboard
```

If Octopus is already configured, rerunning `onboard` keeps the existing config in place. Use `octopus configure` to change settings on an existing install.

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm octopus onboard --run
```

Quickstart defaults + immediate start:

```sh
pnpm octopus onboard --yes
```

When onboarding starts Octopus from an interactive terminal, it opens the
onboarding page in your browser once. Non-interactive terminals stay silent.
Suppress browser opening explicitly for headless or automated runs with either
environment variable:

```sh
PAPERCLIP_NO_BROWSER=1 pnpm octopus onboard --yes
PAPERCLIP_OPEN_ON_LISTEN=false pnpm octopus onboard --yes
```

On an existing install, `--yes` now preserves the current config and just starts Octopus with that setup.

## `octopus doctor`

Health checks with optional auto-repair:

```sh
pnpm octopus doctor
pnpm octopus doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration, including AWS Secrets Manager non-secret env
  config when selected
- Storage configuration
- Missing key files

## `octopus configure`

Update configuration sections:

```sh
pnpm octopus configure --section server
pnpm octopus configure --section secrets
pnpm octopus configure --section storage
```

`--section secrets` updates the deployment-level provider used as the fallback
for secrets that do not target a specific company vault. Per-company provider
vaults (named instances, default vault selection, multiple vaults per provider,
coming-soon GCP/Vault) live in the board UI under
`Company Settings → Secrets → Provider vaults` and the
`/api/companies/{companyId}/secret-provider-configs` API.

## `octopus env`

Show resolved environment configuration:

```sh
pnpm octopus env
```

This now includes bind-oriented deployment settings such as `PAPERCLIP_BIND` and `PAPERCLIP_BIND_HOST` when configured.

## `octopus allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
npx octopus allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Logs | `~/.paperclip/instances/default/logs` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |

Override with:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm octopus run
```

Or pass `--data-dir` directly on any command:

```sh
npx octopus run --data-dir ./tmp/paperclip-dev
npx octopus doctor --data-dir ./tmp/paperclip-dev
```
