# Stintwork

Stintwork takes work items from an idea to a merged change with your own coding agents. It shows stages on a local board and carries a brief and handoff between stints.

```bash
npx stintwork
```

Start it inside a git repository. It starts a local server, prints its address and opens the browser.

**Status:** v0.1, local-only. Claude Code and Codex are verified over ACP. Grok Build is experimental and not verified end to end.

The single npm package is prepared but **not yet published to npm**. The command above is the intended entry point after publication; it cannot install this release yet. For now, use a local checkout:

```bash
pnpm install
pnpm build
cd /path/to/your/project
node /path/to/stintwork/dist/bin.js
```

The first two commands belong in the Stintwork checkout. Use its absolute path for the last command. See the [getting-started guide](docs/getting-started.md) for the first work item through Shipped.

## Requirements

- Node.js 22.12 or newer and Git.
- Your own installed Claude Code or Codex CLI, available on PATH and signed in.
- pnpm for building the local checkout. The packaged CLI does not need it unless your project does.

Sign in to the agent you want to use:

```bash
claude auth login
# Or:
codex login
```

One agent is enough. Stintwork includes the Claude Code and Codex ACP adapters. It uses your existing logins; it does not handle your credentials.

The CLI supports `--no-open`, `--help` and `--version`. With `--no-open`, open the printed address yourself. Stop the server with Ctrl+C.

## Concepts

- **Work item:** one feature, bug or small change, with files in `.scratch/<slug>/`.
- **Stage:** one part of its workflow. A gate must pass before it advances.
- **Stint:** one agent's turn on a stage, optionally on a ticket. A brief starts it; a handoff ends it. Stintwork records a checkpoint commit when it ends.

## The board

The Pipeline view shows stages and a **Needs you** queue for questions, permissions, gates and memory proposals. Press `c` to create a work item, or use **Create work item** in ⌘K (Ctrl+K also works). Give it a title, workflow, optional milestone and intent. Creation is one commit.

The **Setup** chip previews proposed project files. You select the changes, then confirm one commit. It also reports whether each agent's stage skills are found, missing or can't tell. Stintwork never installs skills.

Built-in workflows are YAML:

- **Feature:** Clarify → Spec → Tickets → Implement → Review → Ship.
- **Bug:** Diagnose → Fix → Review → Ship.
- **Quick:** Do → Review → Ship.

**Customise** copies a built-in to `.stintwork/workflows/` for editing. **Edit roadmap** changes milestones and their work items, with one commit per edit.

Choose an agent and permission level for each stint: **Ask**, **Edit freely** or **Autonomous**. Read the agent-specific warnings in the brief preview. Answer unresolved handoff items with a developer note for the next brief.

Review needs decided findings, passing current checks, no stale evidence and no open memory proposals. Ship means a merge: **Merge locally**, or a pull request through `gh` after explicit push confirmation.

## Project files

Specs, tickets, gate approvals and review decisions stay in the project. Once a work item has a worktree, edit its files there; the drawer shows the path.

| Path | Contents |
|---|---|
| `.scratch/<slug>/` | `spec.md`, `issues/NN-*.md`, `workflow.yaml`, `review.yaml` |
| `.stintwork/roadmap.md` | Milestones and their work items |
| `.stintwork/config` | `permissionLevel` and local `checks` |
| `.stintwork/workflows/` | Custom workflow YAML |
| `.stintwork/local/` | Gitignored stint logs and handoffs |

Agents' changes to `GLOSSARY.md`, `docs/adr/` and `AGENTS.md` become memory proposals for you to accept or reject.

## What's here

Contributor references:

| Path | What it is |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) | First work item, from creation to Shipped |
| [`docs/plan.md`](docs/plan.md) | Architecture, milestones and later work |
| [`GLOSSARY.md`](GLOSSARY.md) | The product's vocabulary |
| [`docs/adr/`](docs/adr/) | Decision records |
| [`docs/brief.md`](docs/brief.md) | Product brief and scope |
| [`docs/research/2026-10-09-spikes.md`](docs/research/2026-10-09-spikes.md) | ACP and brief/handoff evidence |
| [`prototype/`](prototype/) | Throwaway design reference; Pipeline was chosen |
| [`spikes/acp-probe/`](spikes/acp-probe/) | ACP capability checks |

Licensed under [Apache-2.0](LICENSE).
