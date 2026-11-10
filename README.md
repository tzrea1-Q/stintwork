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

**Status:** v0.1, local-only. Claude Code and Codex are verified over ACP. Grok Build and Antigravity CLI are experimental. Grok is not verified end to end: its 1.0.77 basic, commands, cancel and resume probes passed, but real stints on the maintainer's account were rate limited; ask-mode permissions remain untested.

Stintwork is published on npm. See the [getting-started guide](docs/getting-started.md) for the first work item through Shipped.

## Requirements

- Node.js 22.12 or newer and Git.

### Set up your agents

Stintwork uses your existing agent logins. Compatible installed CLIs are preferred; Claude Code and Codex can also use a pinned bundled fallback at explicit stint start. Grok Build and Antigravity CLI require separately installed CLIs.

| Agent | CLI | Sign in | Status |
|---|---|---|---|
| Claude Code | `claude` | `claude auth login` | Verified over ACP |
| Codex | `codex` | `codex login` | Verified over ACP |
| Grok Build | `grok` | `grok login` | Experimental; not verified end to end |
| Antigravity CLI | [`agy`](https://antigravity.google/cli) 1.5.3 or newer, below 2.0.0 | Run `agy` once and sign in yourself | Experimental |

Antigravity stays in its default permission mode. Stintwork approves eligible in-worktree edits and safe in-worktree shell commands according to the selected permission level; requests it cannot prove safe need your decision. Currently, after a server restart, an interrupted Antigravity stint uses a checkpoint and you start a new stint. Native resume is planned.

Board startup and availability refresh do not download agents or start ACP sessions; Antigravity's availability check runs `agy --version`. Untested agents show **Not prepared**. At explicit stint start, review **Agent source (Installed / Bundled)**, executable path/version, adapter version and selection reason. Confirm before downloading, cancel preparation or retry failures. Missing, incompatible or unverified Claude/Codex CLIs can use the pinned bundled fallback. Only the selected agent is prepared in a cache outside the project; global CLIs are unchanged.

When login is required, run your own login command above and retry; Stintwork never invokes login or reads, stores or proxies credentials. Offline npx requires the root Stintwork package already cached. Uncached agent preparation needs a connection; prepared packages prove neither login readiness nor offline provider inference. See [agent preparation](packages/agents/profiles/README.md) for cache paths and overrides.

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
- **Project setup:** open **Settings → Project setup** to preview files to add or change. Existing trackers stay unchanged by default; replacements require opt-in and show how many lines they remove. Select the changes and confirm one commit. Collapsed agent summaries report skill availability; they do not install skills.
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
