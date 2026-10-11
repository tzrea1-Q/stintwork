# Stintwork: production plan to v0.1

Status: draft for discussion · 2026-10-09. Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md). Decisions are recorded in [`docs/adr/`](adr/). The product is described in [`docs/brief.md`](brief.md).

## Goal

v0.1 lets one developer run `npx stintwork` in a real repo and take a feature from clarify to merge. Different agents do the stints, and the developer never writes context by hand. The board (Pipeline view) shows the state of the whole project at a glance.

## How we'll build it

- **Dogfood from the first milestone.** Stintwork's own plan and tickets live in this repo's `.scratch/`. From M1 on, Stintwork opens itself, and from M2 on it helps build itself.
- **Every milestone ends usable.** Each one is a vertical slice with an exit test on a real repo, not a layer.
- **Agents do most of the implementation**, verified by the developer and by checks. Tickets are written so an agent can take them without a conversation.

## Architecture

A TypeScript pnpm monorepo. The core is a deep module with no direct I/O; everything that touches the outside world sits behind it.

| Package | Responsibility |
|---|---|
| `core` | The project model: index of work items, tickets, specs and milestones from repo files; workflow and gate logic; stint lifecycle; attention items; brief compiler. Pure and fully unit-testable against fixture repos. |
| `agents` | The ACP client. Per-agent capability profiles (Claude Code, Codex, Grok Build), the permission-level mapping, and auth detection. Later, the terminal fallback. |
| `git` | Worktrees with dependencies installed and git writable, checkpoint commits, and `gh` for PRs and checks. |
| `server` | A local Hono server: HTTP plus WebSocket, a file watcher, and the wiring between core, agents and git. |
| `web` | React UI. The Pipeline view first, rebuilt from prototype variant B (not copied). Views only read state and send actions (ADR 0006). |
| `cli` | The `stintwork` bin for `npx`: finds the repo, starts the server and opens the browser. |

**Testing:**
- `core` gets fast unit tests on fixture repos.
- Stint lifecycle tests run against the fake ACP agent from `spikes/acp-probe/`.
- The probe becomes a contract test against the real agents, run manually and before releases.

## Milestones

Sizes are relative (S, M, L), for one developer working with agents. They are not dates.

### M1 · The board (read-only) · M

`npx stintwork` opens a repo and shows its work on the board.

- The CLI and local server start, and the browser opens.
- Work items, specs and tickets are read from `.scratch/`, and milestones from `.stintwork/roadmap.md`.
- Each work item's stage comes from `workflow.yaml`, or is inferred from its files when there is none.
- The Pipeline board shows stage columns and cards; a drawer shows the spec and tickets in blocking order.
- Changes to the files appear on the board without a reload.
- Setup detection shows what's missing (tracker config, AGENTS.md) but doesn't write anything yet.

**Exit test:** Stintwork opened on its own repo shows its own plan correctly. Editing a ticket's `Status:` line in an editor moves it on the board.

### M2 · The first stint (Codex only) · L

The developer starts a stint from a ticket, watches it, stops it, and resumes it from the handoff.

- The brief compiler produces pointers, the last handoff, what changed since, and the prompt, shown before starting.
- Worktree setup: one per work item, dependencies installed, git metadata writable by the agent.
- A Codex stint over ACP streams messages, tool calls, plans and file edits into the drawer.
- Stop, then the checkpoint commit (ADR 0004), then a handoff request. The handoff is stored in the stint log.
- Stint logs are written to `.stintwork/local/stints/`. Ticket status is read back from the files the agent updated.

**Exit test:** one real Stintwork ticket is implemented through Stintwork with Codex. It is stopped once and resumed from the brief, and all checks pass.

### M3 · Needs you and every agent · L

Stints can ask for things, stages move forward, and any of the three agents can take any stage. Spec: `.scratch/needs-you/spec.md`.

- The Needs-you queue of attention items: permission requests, stints that ended with unresolved handoff items (answered with a developer note in the next brief), stages ready for approval, and agents needing a login. Shown on cards, in the tab title, and as optional browser notifications.
- Gates are the developer's approval in M3, recorded in `workflow.yaml`. Checks-based gates move to M4.
- Stage-level stints on any stage with a skill (Clarify, Spec, Tickets, Implement, Review).
- Claude Code and Grok Build are added. Each stage has an agent picker, and missing logins show the command to run.
- Permission levels (Ask, Edit freely, Autonomous) are mapped onto each agent's modes, plus answers Stintwork gives itself, with explicit warnings for agents that can't honour a level.
- After a restart, stints stay `interrupted` and resume from the brief. Reattaching to agent processes is dropped: they end with the server.

**Exit test:** a Stintwork ticket is started with Claude Code, stopped, has a requirement changed, and is finished by Codex. No hand-written context, and every permission prompt is answered from the queue. The Implement gate is then approved from the queue.

### M4 · Review and ship · L

Work is reviewed with evidence tied to a commit, and shipped without leaving Stintwork. Spec: `.scratch/review-and-ship/spec.md`. Early M4 polish from the M3 exit lives in `.scratch/agent-polish/`.

- Review stints run `/code-review`. Findings are requested in a fixed format after the turn (as with handoffs), tied to the reviewed commit, and pinned to diff lines in the review overlay. Decisions (resolved, accepted, sent back) live in a review file in the work item folder.
- Checks are configurable local commands (`.stintwork/config`, defaulting to the project's scripts) run in the worktree and tied to a commit, plus the PR's CI checks from `gh` when a pull request exists. Stale evidence (findings or checks for an older commit) is flagged and blocks the Review gate.
- Memory proposals are derived from stints' changes to project memory files (glossary, decision records, AGENTS.md). You accept them, or reject them with a revert commit. Open proposals block shipping.
- Ship: open a pull request (push only after explicit confirmation) and merge it via `gh`, or merge locally when there's no remote. Merging removes the worktree and branch and marks the work item shipped.

**Exit test:** the full acceptance scenario in [brief §13](brief.md#13-first-milestone-acceptance-scenario) passes on a second real repo (a PagePilot copy).

Grok Build's end-to-end check (`.scratch/agent-polish/issues/04`) is deferred to Later: its API rate-limited every real stint, so M4 ships with Claude Code and Codex verified.

### M5 · v0.1 release · M

Someone else can use it. Spec: `.scratch/first-release/spec.md`.

- The first stages write files: create a work item, then Clarify, Spec and Tickets stints produce `spec.md` and tickets in `.scratch/`.
- Built-in workflows (Feature, Bug, Quick task) as YAML in `.stintwork/workflows/`, customisable by copying.
- Guided setup for a repo without mattpocock's layout. It writes the tracker config and an AGENTS.md pointer, with confirmation.
- Roadmap editing for milestones.
- Packaging: the npm package `stintwork` (no native dependencies), CI with a packed-tarball smoke test, Apache-2.0 headers, README, and a short getting-started guide. Publishing and making the repository public each need the maintainer's confirmation.

**Exit test:** 3–5 developers outside the project install it and start a real task in their own repo within a minute, without help. Afterwards they say whether they'd keep using it.

### Later (not in v0.1)

- Grok Build verified end to end: the ACP probe and a real stint with a parsed handoff (deferred from M4, agent-polish 04). It is registered but unverified until then.
- The terminal fallback for agents without ACP (moved from M5: it needs a native module, `node-pty`, that would make `npx` installs fragile, and every v0.1 agent works over ACP). Revisit if Claude's ACP billing risk materialises.
- The Lists and Cockpit views.
- Reading GitHub Issues.
- More ACP agents (e.g. Gemini CLI).
- A desktop wrapper.
- Parallel stints on one work item.
- A visual workflow editor.
- Teams.

## Risks

| Risk | Mitigation |
|---|---|
| ACP adapters change or regress | Pin adapter versions; run the probe as a contract test before each release (ADR 0002) |
| Provider rules on subscription use change again | Use only the developer's own CLIs and logins (ADR 0003); support API-key login; the terminal fallback (now Later) would keep every agent usable |
| State drifts after crashes or restarts | Derive state from files and git; checkpoints on every stop; stint logs as an append-only record |
| Scope creep toward a "platform" | The "Later" list and brief §12 are explicit no's; each milestone has one exit test |
| One maintainer's bandwidth | Agents implement tickets via Stintwork itself from M2; Codex delegation for parallel work |

## Settled (2026-10-09)

1. **Stage without `workflow.yaml`:** infer it from the files, show it as inferred, and write `workflow.yaml` the first time the developer acts on the work item.
2. **`.scratch/` is committed.** It is the project record (ADR 0001).
3. **Permission levels:** *Ask* (every edit and command), *Edit freely* (edits in the worktree without asking, ask before commands outside a safe list), and *Autonomous* (anything inside the worktree). **Edit freely is the default.** Each agent gets a mapping table in M3.
4. **Gate approvals are recorded in `workflow.yaml`** (who, when, at which commit), so specs and tickets stay in mattpocock's format.
5. **Node 22+ and pnpm**, matching PagePilot and the prototype.

Stintwork's own work is tracked in `.scratch/`, and milestones in `.stintwork/roadmap.md`.
