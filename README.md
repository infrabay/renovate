# renovate

Self-hosted [Renovate](https://docs.renovatebot.com/) for the `infrabay` GitHub organization.

A scheduled GitHub Actions workflow runs Renovate as the org's own GitHub App (`infrabay-renovate`).
Renovate opens dependency update PRs, keeps a Dependency Dashboard issue in each repository, and
opens security fix PRs from Dependabot alerts.

It is self-hosted rather than the hosted Renovate app because some repositories need
`postUpgradeTasks`. For example, `terraform-provider-nelm` bumps `github.com/werf/nelm` in `go.mod`
with a custom manager, so `go mod tidy` must regenerate `go.sum`. Only a self-hosted Renovate can run
such commands.

## What is in this repository

| File | Purpose |
| --- | --- |
| [`.github/workflows/renovate.yml`](.github/workflows/renovate.yml) | Runs Renovate every hour at :17 and on demand. |
| [`.github/workflows/validate.yml`](.github/workflows/validate.yml) | Validates the three config files on every PR and push to `main`. It uses no secrets. |
| [`config.js`](config.js) | Global (self-hosted) configuration: autodiscovery, onboarding, allowed post-upgrade commands, how tools are installed, cache and commit identity. |
| [`default.json`](default.json) | The org-wide preset. Repositories use it with `"extends": ["local>infrabay/renovate"]`. |
| [`renovate.json`](renovate.json) | This repository's own config. It extends the preset and keeps the pinned actions and Renovate version up to date. |

How a run works:

1. The workflow mints a short-lived installation token for the App. The token is limited to the
   repositories listed in the workflow and to the permissions Renovate needs, and it is revoked at
   the end of the job.
2. If the token can see any private repository, the run stops. The logs of this public repository
   are public, and Renovate logs file names, dependencies and the config of every repository it
   processes.
3. Renovate autodiscovers the repositories the token can see (`infrabay/*`). A repository without a
   Renovate config gets an onboarding PR first. Every other repository is updated according to its
   own `renovate.json`.
4. Commits go through the GitHub API, so they are signed ("Verified") and authored by
   `infrabay-renovate[bot]`.

## One-time setup

### 1. GitHub App permissions

In **Organization settings → Developer settings → GitHub Apps → infrabay-renovate → Permissions &
events**, set exactly these permissions:

| Scope | Permission | Access | Why |
| --- | --- | --- | --- |
| Repository | Administration | Read-only | Read branch protection; assign teams to PRs |
| Repository | Checks | Read and write | Read and set check results |
| Repository | Commit statuses | Read and write | Set the Renovate status checks |
| Repository | Contents | Read and write | Create branches and commits |
| Repository | Dependabot alerts | Read-only | Security fix PRs (`vulnerabilityAlerts`) |
| Repository | Issues | Read and write | Dependency Dashboard and config warning issues |
| Repository | Metadata | Read-only | Required by GitHub |
| Repository | Pull requests | Read and write | Open and update PRs |
| Repository | Workflows | Read and write | Update files under `.github/workflows/` |
| Organization | Members | Read-only | Resolve team reviewers and assignees |

Set everything else to **No access**, including Repository → Actions and Organization →
Administration. Leave the webhook inactive.

After you change permissions, an org owner must accept them for the installation: open
**Organization settings → GitHub Apps → infrabay-renovate → Configure** and accept the permissions
update request (GitHub also emails the owners about it). Until then, minting the token fails,
because the workflow asks for permissions the installation does not have yet.

### 2. Install the App on the organization

Install the App on `infrabay` with **Only select repositories** and pick the repositories Renovate
should manage, including this one (the Renovate presets are read from here). Do not include any
private repository.

### 3. Private key and Client ID

1. In the App settings, generate a private key and download the `.pem` file.
2. In this repository, go to **Settings → Environments → New environment** and name it `renovate`:
   - **Deployment branches and tags:** Selected branches and tags → `main`.
   - No required reviewers and no wait timer, because scheduled runs must not wait for approval.
   - **Environment secret** `RENOVATE_APP_PRIVATE_KEY`: the whole contents of the `.pem` file.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable**
   `RENOVATE_APP_CLIENT_ID`: the App's **Client ID** (`Iv23...`, shown on the App's settings page).
   The numeric App ID works as well.
4. Delete the downloaded `.pem` file.

From the command line (the `gh secret set` command reads the key from stdin):

```sh
gh api -X PUT repos/infrabay/renovate/environments/renovate \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/infrabay/renovate/environments/renovate/deployment-branch-policies \
  -f name=main -f type=branch
gh secret set RENOVATE_APP_PRIVATE_KEY --repo infrabay/renovate --env renovate < infrabay-renovate.*.private-key.pem
gh variable set RENOVATE_APP_CLIENT_ID --repo infrabay/renovate --body 'Iv23...'
```

### 4. Managed repositories

For each repository Renovate manages:

- Turn on **Dependabot alerts** (Settings → Advanced Security). Renovate reads them to open security
  fix PRs.
- Leave **Dependabot security updates** and Dependabot version updates off. Renovate makes those
  PRs, and two bots would open duplicate PRs.
- Keep Issues enabled, because the Dependency Dashboard is an issue.
- Do not also install the hosted Renovate app. Both would use the `renovate/` branch prefix.

## Adding a repository

1. Add the repository name to `repositories:` in the "Mint GitHub App installation token" step of
   [`renovate.yml`](.github/workflows/renovate.yml), and add it to the App installation.
2. On the next run, Renovate opens an onboarding PR that adds a `renovate.json` extending
   `local>infrabay/renovate`. Merge it, or add your own config first. A repository that already has
   a Renovate config gets no onboarding PR.

Only public repositories can be added. The workflow refuses to run if the token can see a private
one.

### Post-upgrade commands

Updates from the `gomod` manager need no post-upgrade command: the preset sets
`"postUpdateOptions": ["gomodTidy"]`, so Renovate runs `go mod tidy` itself and drops the `go.sum`
lines of the old version. Without it, a check such as `go mod tidy -diff` fails on every Go update
PR. A post-upgrade command is needed only when a custom manager edits `go.mod`, because then the
`gomod` manager does not run.

`config.js` allows exactly one post-upgrade command, `go mod tidy` (`allowedCommands:
['^go mod tidy$']`). The Renovate image has no Go installed, so a repository that runs it must also
ask for Go:

```json
"postUpgradeTasks": {
  "commands": ["go mod tidy"],
  "fileFilters": ["go.mod", "go.sum"],
  "executionMode": "branch",
  "installTools": { "golang": {} }
}
```

Renovate then installs the latest stable Go before running the command. With Go's default
`GOTOOLCHAIN=auto`, Go switches to the newer toolchain if `go.mod` has a `toolchain` line that asks
for one. To allow another command, add an anchored regular expression to `allowedCommands` in
`config.js`.

## Running manually

**Actions → Renovate → Run workflow**, or from the command line:

```sh
gh workflow run renovate.yml --repo infrabay/renovate
gh workflow run renovate.yml --repo infrabay/renovate -f logLevel=debug -f dryRun=lookup
```

| Input | Values | Effect |
| --- | --- | --- |
| `logLevel` | `info` (default), `debug` | Log level of the run. The logs are public. |
| `dryRun` | `none` (default), `extract`, `lookup`, `full` | `none` makes real changes. The others only log what Renovate would do. |
| `repoCache` | `enabled` (default), `disabled`, `reset` | Use, skip or rebuild the repository cache. |

This setup has no webhook: Renovate runs only from the hourly schedule or by hand. Ticking a
checkbox on a Dependency Dashboard or in a Renovate PR (for example "rebase/retry" or "create PR
now") therefore takes effect on the next hourly run, usually within an hour. To make it happen
sooner, run the workflow by hand.

## Updating Renovate itself

Renovate keeps this repository up to date as well:

- The actions in both workflows are pinned to full commit SHAs with version comments, and grouped
  into one "github actions" PR.
- The Renovate version (`renovate-version` in `renovate.yml`) and the validator image
  (`container.image` in `validate.yml`) are bumped together with `renovatebot/github-action` in one
  "renovate" PR, once a week on Mondays. The validate workflow checks the configs with the new
  version on that PR.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Mint GitHub App installation token" fails with `422` or "permissions requested are not granted" | The installation has not accepted the permissions the workflow asks for. Do steps 1 and 2 of the setup, then approve the request. |
| The same step fails with a 404 or "not installed" error for a repository | The repository is in the workflow's `repositories:` list but not in the App installation. |
| The job fails at once with "not allowed to deploy to renovate due to environment protection rules" | The run was started from a branch other than `main`. |
| The job waits for approval | The `renovate` environment has required reviewers or a wait timer. Remove them. |
| "Refuse private repositories" fails | A private repository is in the token's `repositories:` list. Remove it. |
| A PR that touches `.github/workflows/` is never created, with "workflows permission" in the log | The App lacks **Workflows: Read and write**. |
| `go.sum` is not updated, or the log says "Post-upgrade command ... has not been added to the allowed list" | The command must match `allowedCommands` in `config.js` exactly. Also add `installTools: { "golang": {} }` to that repository's `postUpgradeTasks`, or Go is missing. |
| Security fix PRs never appear | Dependabot alerts are off in that repository, or the App lacks **Dependabot alerts: Read-only**. |
| Scheduled runs stopped | GitHub disables scheduled workflows in a public repository after 60 days without repository activity. Re-enable the workflow on the Actions tab. Merging Renovate's own PRs here counts as activity. |
| Strange or stale results | Run by hand with `repoCache=reset`, and with `logLevel=debug` if you need more detail. |
| An onboarding PR was closed by mistake | Renovate then skips that repository. Add a `renovate.json` with `{"extends": ["local>infrabay/renovate"]}` by hand. |

Validate configuration changes locally before pushing:

```sh
npx --yes --package renovate@<version> -- renovate-config-validator --strict config.js
npx --yes --package renovate@<version> -- renovate-config-validator --strict --no-global default.json renovate.json
```

Use the version from `renovate-version` in `renovate.yml`.

## License

[MPL-2.0](LICENSE)
