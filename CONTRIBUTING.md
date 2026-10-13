# Contributing

## How we build

[The plan](docs/plan.md) groups work into milestones. Specs and tickets live in `.scratch/`, following [the issue-tracker conventions](docs/agents/issue-tracker.md).

Coding agents implement tickets in stints. A coordinator reviews the changes, verifies `format:check`, `lint`, `typecheck`, `test`, `build` and `smoke:package`, then merges. A finished stint is not a Shipped work item; the change must be merged.

Read [AGENTS.md](AGENTS.md) before changing files. Use the terms in [GLOSSARY.md](GLOSSARY.md) and follow the [decision records](docs/adr/).

## Report a problem or idea

Open a GitHub issue with the bug-report or feature-idea form. For a bug, include versions, steps to reproduce, expected and actual results, and relevant logs. Remove secrets and private project data first. For an idea, explain the problem, the proposed change and alternatives.

GitHub issues are reports from developers. Implementation tickets stay in `.scratch/`; Stintwork does not sync GitHub Issues. Report security problems privately as described in [SECURITY.md](SECURITY.md).

## Run from source

Use Node.js 22.12 or newer, Git and the pnpm version in `package.json`. From the Stintwork checkout:

```bash
pnpm install
pnpm stintwork
```

This opens Stintwork on its own repository. To work on another project, follow [the getting-started guide](docs/getting-started.md). Agents still need their own installed CLIs and logins.

Run the checks before handing off a change:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:package
```

`pnpm smoke:package` packs and installs the package. It is slower and needs network access.
