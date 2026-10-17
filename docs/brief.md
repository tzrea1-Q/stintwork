# Stintwork — v1 brief

Draft for discussion · 2026-10-08 · Name decided 2026-10-09: **Stintwork** — agents work in stints and hand over; the work continues.

## 1. One line

Open any repo, see what you're building and what's next, and take each piece of work through a guided workflow with whichever coding agent you choose, without re-explaining the project.

## 2. Who v1 is for

You first: a solo developer maintaining a real application over weeks, using Claude Code, Codex and Grok Build. Then 3–5 developers like you. Not teams, enterprises, or first-time prototypers yet.

## 3. Decisions so far

| Question | Decision |
|---|---|
| Where durable state lives | Markdown in the repo, committed |
| Form | Local web app started with `npx` in a repo |
| Interacting with agents | Structured UI over ACP, with a real terminal as fallback. ACP confirmed for Claude Code, Codex and Grok Build (see `docs/research/2026-10-09-spikes.md`) |
| First workflow method | mattpocock/skills |
| Primary view | **B · Pipeline**: a board whose columns are workflow stages, with a large work-item drawer. A (Lists) and C (Cockpit) stay on the roadmap as alternative views users can choose (see `prototype/`) |
| Name | **Stintwork** |

## 4. Principles

1. **Value before setup.** Useful in the first minute. The whole vocabulary is three concepts.
2. **Files are the source of truth.** The app is a lens and a runner. Delete it and nothing is lost.
3. **Adopt formats before inventing them.** Agents and skills already read and write them.
4. **Derive state; don't duplicate it.** Status comes from files, `git` and `gh`. The app stores only what nothing else records.
5. **Useful with one agent.** Using several agents is a choice per stage, not a system to configure.
6. **Stay thin over agents.** Drive the official CLIs. Never read or store credentials.

## 5. Concepts

| Concept | What it is | Where it lives |
|---|---|---|
| **Project** | A git repo | The repo |
| **Work item** | A feature or bug going through a workflow | `.scratch/<slug>/` |
| **Stint** | One agent's turn on one stage of a work item, optionally on one ticket | `.stintwork/local/stints/` (gitignored) |

Tickets (`issues/NN-*.md`) appear inside a work item as its task list, not as a fourth top-level concept. Agents are detected on your PATH and picked from a dropdown, with nothing to configure.

## 6. On-disk format: adopt mattpocock's conventions

mattpocock/skills already defines a local-Markdown issue tracker (`issue-tracker-local.md` in `setup-matt-pocock-skills`). Use it unchanged, so every skill reads and writes Stintwork's data with no adapter:

```
AGENTS.md                           # canonical; "## Agent skills" block points to docs/agents/
CLAUDE.md                           # one line: "See AGENTS.md" (fixes the Claude-vs-Codex gap)
GLOSSARY.md                         # domain vocabulary        ← grill-with-docs, domain-modeling
docs/adr/NNNN-*.md                  # decisions                ← grill-with-docs, domain-modeling
docs/agents/issue-tracker.md        # says "local markdown"    ← setup-matt-pocock-skills
.scratch/<feature>/spec.md          # spec                     ← to-spec
.scratch/<feature>/issues/NN-*.md   # tickets: Status:, Blocked by:, ## Comments  ← to-tickets, implement
.scratch/<effort>/map.md            # very large efforts       ← wayfinder

# The only Stintwork additions:
.scratch/<feature>/workflow.yaml    # workflow, current stage, agent per stage, approvals (who/when/commit)
.stintwork/roadmap.md               # milestones → features (edited by you)
.stintwork/workflows/*.yaml         # workflow definitions
.stintwork/local/                   # gitignored: stint logs, handoff notes, session ids
```

**Consequence:** memory shared across vendors becomes a property of the file layout, not a feature to build. Claude, Codex and Grok all read AGENTS.md, the glossary, ADRs, the spec and ticket comments natively.

**Handoffs follow mattpocock's own rule.** His `handoff` skill deliberately writes to `$TMPDIR` and references durable artifacts rather than copying them. Per-stint handoff notes therefore live in `.stintwork/local/`. Anything worth keeping must land in the spec, tickets, ADRs or glossary.

## 7. Built-in workflows

**Feature**

| Stage | Skill | Output | Gate | Default agent |
|---|---|---|---|---|
| Clarify | `/grill-with-docs` | Resolved questions; GLOSSARY and ADR updates | You mark it done | Claude |
| Spec | `/to-spec` | `spec.md` | Approve | Claude |
| Tickets | `/to-tickets` | `issues/NN-*.md` with blocking order | Approve | Claude |
| Implement | `/implement` per ticket | Commits on a worktree branch; ticket `Status:` | Checks pass | Any (e.g. Grok) |
| Review | `/code-review` | Findings on Standards and Spec axes | Resolve or accept | Codex |
| Ship | `/pr` + `gh` | PR with CI status | Merge | — |

**Bug:** Diagnose (`/diagnosing-bugs`) → Fix (`/tdd`) → Review → Ship.
**Quick task:** Do → Review → Ship, with no spec. Small changes need a short path.

**Customising in v1:** copy a YAML file and change the skills, agents or gates. There is no visual editor yet.

Notes:
- User-invoked skills (`disable-model-invocation: true`) are triggered by sending the slash command as the prompt. Invocation syntax differs between agents, so each adapter handles it.
- `/implement-spec` (parallel subagents across ready tickets) can be offered as an alternative Implement mode later.

## 8. Stints: brief in, handoff out

- **Start.** Create a worktree (for Implement stages). Compose the prompt: the stage's skill command, pointers to the work item's files, the last handoff, and what changed since it was written. The brief is a list of pointers, not copied text.
- **During.** The ACP event stream drives the UI: messages, tool calls, plans and permission requests. Questions and approvals go to **Needs you**.
- **End.** Stintwork makes a checkpoint commit (ADR 0004), then asks the agent for a handoff: where it stopped, what's unresolved, and which skill should come next. Proposed durable changes (ticket status, ADRs, glossary) appear as diffs for you to accept.
- **Switching agents** starts a new stint on the same work item with the same brief. No transcript is transferred.

## 9. Agent integration

| Agent | Path | Notes |
|---|---|---|
| Claude Code | `@agentclientprotocol/claude-agent-acp` | Built on the Claude Agent SDK; can point at your installed Claude Code |
| Codex | `@agentclientprotocol/codex-acp` | ChatGPT login or API key |
| Grok Build | Native ACP (reported) | `xai-org/grok-build`, Apache-2.0, beta since May 2026 |
| Any CLI | Real terminal (`node-pty` + `xterm.js`) | Fallback; the app still tracks files and git, but not the conversation |

- The client side uses `@agentclientprotocol/sdk` (`ClientSideConnection` over stdio).
- **Risk:** Claude over ACP goes through the Agent SDK. That is the surface whose subscription billing Anthropic changed, then paused, in 2026. Keep the terminal fallback first-class so Claude Code always works through its own CLI.

## 10. Screens

v1 builds these as view B (Pipeline): Project is the stage board, Work item and Review open as a drawer and a full-screen overlay, and Needs you is a slide-over queue. Keep the data layer independent of views so A and C can be added later.

| Screen | Question it answers |
|---|---|
| **Needs you** (home) | What's waiting on me: questions, approvals, reviews |
| **Project** | Milestones → features with a stage pill each; what's in progress; what's blocked |
| **Work item** | Stage rail; spec and tickets in blocking order; stints; one "next action" button |
| **Review** | Diff; findings pinned to lines; checks for that exact commit; accept or request changes |

Throughout: a ⌘K command palette, `c` to create, `j`/`k` to move, and a stable localhost URL for everything. Lists are as dense as Linear's. No dependency graph by default.

## 11. Architecture

`npx stintwork` in a repo starts a Node server on localhost and opens the browser.

- **Server:** Node 20+, TypeScript, Hono (HTTP and WebSocket).
- **UI:** React + Vite, Tailwind + Radix primitives, cmdk.
- **Files:** a chokidar watcher feeds an in-memory index; parse with gray-matter/remark. No database in v1.
- **Git:** shell out to `git` (worktrees) and `gh` (PRs, checks).
- **Stints:** JSONL event logs in `.stintwork/local/stints/`.
- **Packaging:** one npm package. Wrap in Tauri or Electron later if needed.

## 12. Not in v1

Teams and accounts, cloud runners, scheduled automations, a visual workflow editor, two-way GitHub Issues sync, mobile, autonomous swarms, more than one active stint per work item (parallel stints across work items are fine).

v0.2 scope is in `docs/plan.md`: repo preparation in M7, UI foundations in M8, a fast first run in M9, stints surviving restarts in M10, reading GitHub Issues in M11 and a fourth agent, Gemini CLI, in M12. M13 releases v0.2 and makes the repo public. Outside-developer feedback follows the public release and sets later scope. Further agent support follows the plan.

## 13. First milestone: acceptance scenario

On one of your real repos:

1. Run `npx stintwork`. Existing specs and tickets show up, or setup is offered, in under a minute.
2. Create a feature → clarify with Claude → approve the spec → get tickets.
3. Implement ticket 01 with Grok in a worktree, and stop partway through.
4. The next day, resume ticket 01 with Codex, writing no context by hand.
5. Edit a requirement in `spec.md`. The app flags the tickets it affects.
6. Review with Codex → resolve findings → open a PR → see CI → merge.
7. The Project screen shows the feature as shipped, with the ADRs and glossary updated.

**Signals it's working:** you open it daily for your own work, you've stopped writing context prompts by hand, and an agent you switch to doesn't ask questions the files already answer.

## 14. Prior art to borrow from

- **Backlog.md:** local Markdown tasks with a web UI started via `npx`.
- **kandev:** a different agent per workflow step.
- **Vibe Kanban:** worktree and diff-review UX.
- **Archon:** workflows as YAML.
- **mattpocock's docs:** they mention users already building "a hand-built local dashboard" over this format, which is a sign of demand.

## 15. Open questions

1. **GitHub Issues.** v1 uses local Markdown only (ADR 0005). See `docs/plan.md` M11 for reading GitHub Issues through `gh` and the research spike on where specs and gate approvals live. If M11 runs long, M12 moves to v0.3 rather than delaying v0.2.
2. **Is `.scratch/` committed?** The name suggests throwaway files, but here it is the project record. Proposal: commit it.
3. **Approval provenance.** Is `workflow.yaml` in the feature folder the right place for approvals, or should they be a `Status:` line in `spec.md`?
4. **Permission levels per agent.** Map Stintwork's own levels onto each agent's modes. Codex's default "Workspace access" mode never asks. Grok has no ACP modes and follows its own config (yours is `always-approve`).

## 16. Findings from the prototype-stage spikes (2026-10-09)

Details: `docs/research/2026-10-09-spikes.md`.

- **ACP works for all three agents:** structured streaming, skill discovery and slash invocation, permission requests, cancel, and `loadSession` resume. Missing logins surface as a structured "Authentication required" error.
- **Brief and handoff work:** a fresh Codex session and then Claude Code continued a real multi-ticket task from the brief alone. They honoured a requirement changed after the handoff, asked no questions, and all checks passed.
- **Save git state when a stint stops:** interrupted work was left uncommitted, and the next stint's commit mixed in some of it.
- **Worktrees need setup:** they need a dependency install and a writable git directory. Codex's sandbox blocked commits until the git dir was added as writable.
- **The brief removes confusion, not exploration:** agents still read the files it points to.
