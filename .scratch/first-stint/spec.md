# M2 · The first stint

Status: ready-for-agent

Milestone: M2 · The first stint. See `docs/plan.md`, `GLOSSARY.md`, ADRs 0001–0004 and 0006, and `docs/research/2026-10-09-spikes.md`.

## Problem Statement

The board (M1) shows what a project is building, but the developer still has to leave it to get work done. To move a ticket forward, they open an agent in a terminal and explain the project, the ticket, the decisions already made, and what the last agent did, by copying and pasting. When the agent stops partway, nothing records where it stopped. The next agent, or the same one tomorrow, starts by rebuilding that context, and the developer's working tree is left half-changed with nothing committed. The handoff test showed both problems: interrupted work stayed uncommitted, and the next commit mixed it in.

## Solution

From a ticket in the work-item drawer, the developer starts a **stint**: one agent's turn on that ticket. Stintwork shows the **brief** it will send: the skill to invoke, pointers to the files to read, the last handoff, and what changed since. The developer starts it, and Stintwork:
- prepares the work item's worktree;
- launches Codex over ACP with the brief;
- streams the stint live into the drawer: messages, plan, tool calls and file edits.

The developer can stop the stint at any time. Whether it finishes or is stopped, Stintwork makes a **checkpoint** commit and asks the agent for a **handoff**. The next stint on that ticket starts from a brief built from those files, so the developer never writes context by hand. M2 supports Codex only. Claude Code, Grok Build and the Needs-you queue come in M3.

## User Stories

1. As a developer, I want a "Start stint" action on an open, unblocked ticket in the drawer, so that I can move a ticket forward without leaving Stintwork.
2. As a developer, I want "Start stint" to be unavailable on blocked or resolved tickets, with the reason shown, so that I don't start work that can't or needn't happen.
3. As a developer, I want to see the brief before the stint starts, so that I know exactly what the agent will be told.
4. As a developer, I want the brief to name the skill it will invoke (for example `/implement` with the ticket path), so that the agent follows the project's workflow rather than improvising.
5. As a developer, I want the brief to list pointers to AGENTS.md, the glossary, relevant decision records, the spec and the ticket, each with a reason, so that the agent reads the project memory instead of receiving a copy of it.
6. As a developer, I want the brief to include the last handoff for this ticket, with the agent and stint it came from, so that a new stint continues where the last one stopped.
7. As a developer, I want the brief to list what changed since the last stint (for example the spec edited after the handoff), and to say the files win over the handoff, so that a stale handoff can't override a newer requirement.
8. As a developer, I want to see and copy the exact prompt text that will be sent, so that the brief is fully transparent.
9. As a developer, I want the agent picker to show Codex as available and the other agents as "coming in M3", so that I know what's supported today.
10. As a developer, I want starting a stint to say clearly when Codex isn't installed or isn't logged in, including the command to run, so that I can fix it myself (ADR 0003).
11. As a developer, I want each work item to get its own git worktree and branch the first time a stint starts, so that agent changes never touch my main working tree.
12. As a developer, I want the worktree's dependencies installed automatically when the repo uses a known package manager, so that the agent can run the project's checks.
13. As a developer, I want the agent to be able to commit in the worktree, so that its own commits succeed instead of failing silently in its sandbox.
14. As a developer, I want to watch the stint live in the drawer (agent messages, its plan with steps ticking off, tool calls with their status, and file edits), so that I can follow what the agent is doing.
15. As a developer, I want long tool output collapsed by default and expandable, so that the stream stays readable.
16. As a developer, I want the work item's card on the board to show that a stint is running, so that I can see active work at a glance.
17. As a developer, I want to stop a running stint with one action, so that I stay in control.
18. As a developer, I want a stopped stint to end promptly, so that "Stop" means stop.
19. As a developer, I want every stint, whether it finished, was stopped or failed, to end with a checkpoint commit of the worktree's changes, so that the next stint starts from a recorded state (ADR 0004).
20. As a developer, I want no checkpoint commit when nothing changed, so that history stays clean.
21. As a developer, I want each checkpoint's commit message to name the stint, work item, ticket and how the stint ended, so that history explains itself.
22. As a developer, I want the agent asked for a handoff (where it stopped, what's unresolved, suggested next step) after every stint, so that the next stint has a reliable starting point.
23. As a developer, I want the handoff shown as a card at the end of the stint, so that I can read what happened without scrolling the whole stream.
24. As a developer, I want a stint to still end cleanly when the agent fails to give a handoff, saying so, so that a weak agent turn can't break the flow.
25. As a developer, I want each work item's past stints listed in the drawer (agent, ticket, how it ended, when, checkpoint commit), so that I can see the history of the work.
26. As a developer, I want to open a past stint and read its full stream and handoff, so that I can check what an agent actually did.
27. As a developer, I want the ticket's status on the board to change when the agent updates the ticket file, so that progress comes from the files, as everywhere else (ADR 0001).
28. As a developer, I want starting the first stint on a work item to write its `workflow.yaml` (stage and agent), so that an inferred stage becomes a recorded one on the first action.
29. As a developer, I want Stintwork to add `.stintwork/local/` to the repo's `.gitignore` when it's missing, and to tell me it did, so that stint logs never end up in commits.
30. As a developer, I want only one active stint per work item at a time, with a clear message if I try to start a second, so that two agents never edit the same worktree at once.
31. As a developer, I want to run stints on different work items at the same time, so that independent work can proceed in parallel.
32. As a developer, I want a permission request from Codex to appear inline in the stint stream with Allow once and Deny, so that I can answer it without a separate queue (the queue comes in M3).
33. As a developer, I want stints that were running when Stintwork stopped to show as "interrupted" when it starts again, so that the history never claims a stint is still running.
34. As a developer, I want an interrupted stint to get a checkpoint of whatever it left in the worktree on the next start, so that no work is lost uncommitted.
35. As a developer resuming a ticket, I want the next brief to include the previous stint's handoff and checkpoint commit, so that the resume is automatic.
36. As a developer, I want each stint's full record kept in a local log, so that the history survives restarts without a database.
37. As a developer, I want a stint that fails (the agent crashes, or ACP errors) to end as failed with the error shown, still followed by a checkpoint, so that failures are visible and recoverable.

## Implementation Decisions

- **New concept: Stint.** It records the work item, stage, optional ticket, agent, status (`running`, `finished`, `stopped`, `failed`, `interrupted`), start and end times, the base commit, the checkpoint commit, the brief sent, the normalised events, and the handoff. The terms follow `GLOSSARY.md`; "run" and "session" don't appear in names or UI copy.
- **Stages with stints in M2:** stints start only on tickets in the Implement stage (Fix for bugs, Do for quick tasks), invoking that stage's skill on the ticket path. Stints on other stages come in M5.
- **`core` adds pure functions only:**
  - a **brief compiler** that takes the project snapshot, the work item, stage and ticket, the last handoff for that ticket (or the work item), and a list of paths changed since the last checkpoint, and returns the brief: skill, pointers with reasons, last handoff, changed since, and the rendered prompt;
  - **stint log interpretation**, which folds a stint's log entries into a Stint and finds the latest handoff per ticket.

  The prompt follows the format validated in the handoff test: the skill line, then "Read first", the last handoff, "Changed since" (with "where the handoff and the files disagree, the files win"), and the working instructions, including writing ticket status and committing.
- **The snapshot gains stints.** Each work item carries its stints (summaries) and its active stint, if any. The board and drawer read them from the same live snapshot as everything else (ADR 0006).
- **New `git` package:**
  - worktree management: one worktree and branch per work item, in a sibling directory named after the repo (`<repo>-worktrees/<work-item>`, branch `stintwork/<work-item>`), created from the current HEAD on first use and reused after;
  - dependency installation: detect pnpm, npm or yarn from lockfiles, install offline-first, and fall back to an online install;
  - checkpoint commits: stage everything, commit when there are changes, and return the commit;
  - "changed since": paths changed between the last checkpoint and the current main-branch files for the work item's spec and tickets.
- **New `agents` package (Codex only in M2):**
  - spawns the Codex ACP adapter per stint and opens a session in the worktree in Codex's "Workspace access" mode;
  - grants the worktree's git directory as an additional writable directory so the agent can commit;
  - sends the brief, normalises ACP updates into stint events, forwards permission requests, cancels on stop, and requests the handoff with a follow-up prompt in the same session (with a timeout);
  - maps a missing login to the auth error from ADR 0003.

  It exposes an agent-neutral interface so M3 can add Claude Code and Grok Build without changing callers. The adapter version is pinned (ADR 0002).
- **Stint log:** append-only JSONL per stint under `.stintwork/local/stints/`. It is the only stint state on disk; there is no database. On server start, logs without an end entry are marked `interrupted`, and their worktrees get a checkpoint.
- **Server API additions:**
  - preview a brief for a work item and ticket;
  - start a stint (returns the stint id, and rejects a second active stint on the same work item);
  - stop a stint;
  - answer a permission request.

  The WebSocket carries stint events alongside snapshots. Snapshots stay full; stint events stream incrementally.
- **First write paths in Stintwork:**
  - `workflow.yaml` (stage and agent), on the first stint of a work item;
  - the `.gitignore` entry for `.stintwork/local/`;
  - checkpoint commits on the work item branch.

  Stintwork never edits specs or tickets itself in M2; agents do, through skills.
- **Web:**
  - "Start stint" on eligible tickets in the drawer;
  - a brief preview sheet with an agent picker (Codex only) and a copyable prompt;
  - a live stint stream in the drawer (messages, plan, tool calls, file edits, inline permission requests), with Stop;
  - a handoff card, the stint history, and past-stint replay;
  - a running indicator on cards.

  Visual reference: prototype variant B's drawer and run views.

## Testing Decisions

- **Good tests check external behaviour:** what the developer and the repo can observe (API responses, WebSocket messages, commits, files, rendered UI). They don't check internal calls or private state. Each test reads like a user story.
- **Main seam: the server against a fake ACP agent.** Tests start the real server on a temporary git repo with `.scratch/` fixtures and a **scriptable fake ACP agent**. It grows out of the fake agent in `spikes/acp-probe/` and plays scripted messages, plans, tool calls, file edits, permission requests, hangs and crashes. Through HTTP and WebSocket, the tests cover: start → stream → finish → checkpoint → handoff; stop mid-stint; failure; restart recovery to `interrupted`; one active stint per work item; resume, where the second brief contains the first handoff and the changed spec; the `workflow.yaml` and `.gitignore` writes; and clean worktrees producing no checkpoint. Prior art: the server tests from M1 ticket 05 (temp-dir git fixtures, WebSocket timing).
- **Core unit tests:** the brief compiler and stint-log folding, on in-memory fixtures. Prior art: the indexer and stage-resolution tests from M1 tickets 02–04.
- **Web component tests:** brief preview, stint stream rendering (each event kind), Stop, handoff card, history, and disabled states with reasons, against fixture snapshots and events. Prior art: `Board.test.tsx` from M1 tickets 06–07.
- **Real-agent contract check (manual, before M2 exit):** run the ACP probe against the pinned Codex adapter. Run one real stint end to end on a Stintwork ticket. Not in CI.

## Out of Scope

- Claude Code, Grok Build and the agent-per-stage picker (M3).
- The Needs-you queue, attention items, gates and approvals, and permission levels other than Codex's default mode (M3).
- Reattaching to a still-running agent after a server restart; M2 marks such stints interrupted (M3).
- Review stints, findings, checks from `gh`, PRs, merging, and memory proposals (M4).
- Stints on Clarify, Spec and Tickets stages, and creating work items (M5).
- The terminal fallback (M5).
- More than one active stint per work item.
- Steering a running stint with follow-up messages.

## Further Notes

- **Exit test:** one real Stintwork ticket is implemented through Stintwork with Codex. It is stopped once and resumed from the brief, all checks pass, and the history shows both stints with their checkpoints and handoffs.
- **Agent sandboxes:** the handoff test showed Codex can't commit unless the worktree's git directory is writable. M2 grants it through ACP's additional-directories capability. If that proves insufficient, the checkpoint commit still records the work.
- **Codex mode:** Codex's default "Workspace access" mode didn't ask for permission on in-worktree edits in the probe. The inline permission UI is therefore mainly for commands outside the workspace or needing network access.
