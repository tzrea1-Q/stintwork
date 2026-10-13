# Stintwork

English | [简体中文](README.zh-CN.md)

Source and issues: [GitHub](https://github.com/tzrea1-Q/stintwork).

Stintwork is a local workbench for one developer using their own coding agents on a real repository. It takes work through stages from an idea to a merged change, with a brief and handoff so another agent can pick up the next stint. Project intent and memory stay in the repo.

```bash
cd /path/to/your/project
npx stintwork
```

Run this in your own project's git repository, not the Stintwork repository; npx downloads Stintwork from npm for you.

It starts a local server, prints its address and opens the browser. Work item worktrees are created next to the project at `<project>-worktrees/<slug>`.

**Status:** v0.1, local-only. Claude Code and Codex are verified over ACP. Grok Build is experimental and not verified end to end.

Stintwork is published on npm. See the [getting-started guide](docs/getting-started.md) for the first work item through Shipped.

## Requirements

- Node.js 22.12 or newer and Git.

### Set up your agents

Stintwork uses your own installed agent CLIs and logins: for each agent you want it to use, install its CLI on PATH and sign in.

| Agent | CLI | Sign in | Status |
|---|---|---|---|
| Claude Code | `claude` | `claude auth login` | Verified over ACP |
| Codex | `codex` | `codex login` | Verified over ACP |
| Grok Build | `grok` | `grok login` | Experimental; not verified end to end |

Stintwork includes the Claude Code and Codex ACP adapters, not their CLIs or logins; it does not handle your credentials. Set up at least one agent to start; you can set up several, choose one per stage or stint, and switch between stints.

When a missing CLI or login is detected, the agent picker disables that agent and shows an installation or sign-in hint; detected login requirements also appear in **Needs you** with the login command and **Refresh agent availability**.

The CLI supports `--no-open`, `--help` and `--version`. With `--no-open`, open the printed address yourself. Stop the server with Ctrl+C.

## Concepts

- **Work item:** one feature, bug or small change, with files in `.scratch/<slug>/`.
- **Stage:** one part of its workflow. Its gate requires approval, passing checks or a merge before it advances.
- **Stint:** one agent's turn on a stage, optionally on a ticket. A brief starts it; a handoff records where it stopped, what's unresolved and what to do next. When it ends, Stintwork commits any uncommitted changes as a checkpoint.

## How it works

1. **Create a work item.** Press `c`, or choose **Create work item** in ⌘K / Ctrl+K. Give it a title, intent, workflow and optional milestone. Creation makes one commit.
2. **Move through stages.** Each stage has a gate; finishing an agent's stint alone does not advance the work item.
3. **Work in stints.** Preview the brief, then start an agent. The next stint receives the handoff and changes since it. You can switch agents and answer unresolved items with a developer note for the next brief.
4. **Review with evidence.** Resolve or accept every finding, pass the configured checks and keep review and check evidence current. Open memory proposals also block Review.
5. **Ship by merging.** Use **Merge locally**, or open and merge a pull request through `gh`, with explicit confirmation before pushing. Shipped means the change is merged.

## Features

- **Pipeline board:** stages and a **Needs you** queue for questions, permission requests, gate approvals and memory proposals.
- **Guided setup:** the **Setup** button at the top of the board previews files to add or change. Select the changes and confirm one commit. Skill detection reports found, missing or can't tell; it does not install skills.
- **Permissions per stint:** choose **Ask**, **Edit freely** or **Autonomous**. Read the agent-specific warnings in the brief preview; these levels depend on the agent and are not an independent security boundary.
- **Custom workflows:** **Customise** copies a built-in to `.stintwork/workflows/` for you to edit its YAML.
- **Roadmap editing:** **Edit roadmap** changes milestones and their work items, with one commit per edit.

Built-in workflows:

- **Feature:** Clarify → Spec → Tickets → Implement → Review → Ship.
- **Bug:** Diagnose → Fix → Review → Ship.
- **Quick:** Do → Review → Ship.

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

### Developing Stintwork itself

Ordinary use does not require cloning or building Stintwork. To develop Stintwork itself, build in its checkout with pnpm, then run it from your project's git repository:

```bash
cd /path/to/stintwork
pnpm install
pnpm build
cd /path/to/your/project
node /path/to/stintwork/dist/bin.js
```

Use absolute paths in place of the examples.

Licensed under [Apache-2.0](LICENSE).
