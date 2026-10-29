# M3 · Needs you and every agent

Status: ready-for-agent

Milestone: M3 · Needs you and every agent. See `docs/plan.md`, `GLOSSARY.md` (Attention item, Gate, Permission level, Stint), ADRs 0002, 0003, 0004 and 0009, `docs/research/2026-10-09-spikes.md` (ACP results for Claude Code and Grok Build), and the M2 exit findings in `.scratch/first-stint/issues/09-m2-exit.md`.

## Problem Statement

After M2, a developer can run Codex stints from the board, but three things still go wrong.

First, Stintwork never tells you when something needs you. In the M2 exit test a stint sat for 15 minutes waiting for approval to run `pnpm test`, and nothing outside the drawer said so. Permission requests, a stint that ended with open questions, and work items whose stage is ready to advance are all invisible unless you happen to open the right drawer.

Second, stages never move. A work item whose tickets are all resolved stays in Implement, because nothing records the developer's decision that a stage is done.

Third, only Codex works. The developer has Claude Code and Grok Build installed and signed in, and wants Claude to clarify and plan, Grok to build and Codex to review. Each agent also behaves differently about permissions: Codex's default mode never asks about edits, Claude asks Yes/No, and the developer's Grok config approves everything. "How much may this stint do without asking me" has no single answer.

## Solution

**Needs you.** One queue, reachable from the top bar and shown as badges on cards, lists every open **attention item**:
- a pending permission request, answerable in place;
- a stint that ended with unresolved items in its handoff;
- a stage whose gate is ready for approval;
- an agent that needs you to log in.

Answering an item acts immediately and removes it. When a new item arrives, the tab title shows the count and an optional browser notification fires, so a waiting stint never goes unnoticed.

**Gates.** Each stage ends at its **gate**. In M3 every gate is the developer's approval: Stintwork shows the evidence (tickets resolved, last checkpoint, last handoff), and the developer approves to advance the stage or reopens it. Approvals are recorded in `workflow.yaml` (who, when, at which commit). Checks-based gates come with review in M4.

**Every agent.** Claude Code and Grok Build join Codex over ACP. Each stage of a work item has an agent picker, prefilled from the workflow's defaults. The developer can pick any available agent per stint, and missing logins show the exact command to run.

**Permission levels.** Each stint runs at one of three **permission levels**: Ask, Edit freely (the default) or Autonomous. Stintwork translates the level into each agent's own modes and answers the requests the level covers itself. Where an agent can't honour a level (Grok with `always-approve` in its own config), Stintwork says so before the stint starts.

## User Stories

### Needs you

1. As a developer, I want one Needs-you queue listing everything waiting on me across all work items, so that I never have to hunt through drawers.
2. As a developer, I want the queue's count in the top bar and the browser tab title, so that I notice waiting work from any tab.
3. As a developer, I want an opt-in browser notification when a new attention item arrives, so that a stint never waits 15 minutes for me again.
4. As a developer, I want each work item's card to show a badge when it has open attention items, so that I can see on the board where I'm needed.
5. As a developer, I want each attention item to say what it is, which work item, ticket and stint it belongs to, which agent raised it, and how long it has waited, so that I can prioritise.
6. As a developer, I want to answer a permission request directly in the queue with the agent's real options, so that I don't have to open the drawer.
7. As a developer, I want answering a permission request to reach the agent every time, and the queue to show an error if it doesn't, so that a stint is never stuck behind an answer that silently failed.
8. As a developer, I want the permission request's command or file path shown in full, so that I know exactly what I'm allowing.
9. As a developer, I want to know when declining will end the agent's turn (Codex), so that I'm not surprised when the stint stops.
10. As a developer, I want a stint that ended with unresolved items in its handoff to appear in the queue, so that open questions get answered.
11. As a developer, I want to answer those unresolved items by writing a note that goes into the next stint's brief, so that the next agent gets my answer without me re-explaining anything.
12. As a developer, I want to dismiss an unresolved-handoff item when nothing needs answering, so that the queue stays honest.
13. As a developer, I want a stage whose gate is ready (for example, all tickets resolved) to appear in the queue as "ready to approve", so that work moves forward.
14. As a developer, I want an agent that needs a login to appear in the queue with its login command, so that I can fix it and retry.
15. As a developer, I want attention items to disappear as soon as they're resolved, from any tab, so that two tabs never disagree.
16. As a developer, I want the queue to survive a server restart (rebuilt from logs and files), so that nothing waiting on me is forgotten.

### Gates and stages

17. As a developer, I want to approve a stage's gate from the queue or the drawer, so that the work item advances to the next stage.
18. As a developer, I want to see the gate's evidence before approving (tickets resolved, last checkpoint, last handoff, open warnings), so that I approve with confidence.
19. As a developer, I want approvals recorded in `workflow.yaml` (who, when, which commit), so that the decision lives in the repo with the work (ADR 0001).
20. As a developer, I want approving to move the card to the next column on the board, so that the board reflects my decision.
21. As a developer, I want to reopen an approved stage, so that I can send work back when I change my mind.
22. As a developer, I want Stintwork to refuse approval while a stint is running on the work item, so that I don't approve work in progress.
23. As a developer, I want a work item with an inferred stage to get `workflow.yaml` written on its first approval, so that inference becomes a record.
24. As a developer, I want stints to start on any stage that has a skill (Clarify, Spec, Tickets, Implement, Review), so that agents can work beyond Implement.
25. As a developer, I want stage-level stints (no ticket) to get a brief built from the work item and its stage's skill, so that clarifying or planning works like implementing.

### Every agent

26. As a developer, I want Claude Code and Grok Build available alongside Codex when they're installed and signed in, so that I can use my agents.
27. As a developer, I want each stage of a work item to have an agent picker, prefilled from the workflow's default agent, so that Claude can plan, Grok can build and Codex can review.
28. As a developer, I want my agent choice per stage saved in `workflow.yaml`, so that it persists and is visible to every agent.
29. As a developer, I want unavailable agents shown disabled with the reason (not installed, not logged in, plus the command to fix it), so that I know how to enable them.
30. As a developer, I want a handoff written by one agent to feed the next stint's brief whichever agent runs it, so that switching agents costs nothing.
31. As a developer, I want each stint's agent shown in its stream, history and attention items, so that I know who did what.

### Permission levels

32. As a developer, I want to choose a stint's permission level (Ask, Edit freely, Autonomous) in the brief preview, with Edit freely as the default, so that I control how often I'm interrupted.
33. As a developer, I want a project-wide default permission level, so that I don't choose it every time.
34. As a developer, I want Stintwork to translate the level into each agent's modes and to answer requests the level covers itself, so that the level means the same thing for every agent.
35. As a developer, I want requests that Stintwork answered on my behalf recorded in the stint log as automatic, so that I can audit what was allowed.
36. As a developer, I want a warning before starting when an agent can't honour the chosen level (for example, Grok's own config approves everything), so that I'm never misled about what will ask me.
37. As a developer, I want anything outside the worktree to always ask, even at Autonomous, so that the worktree stays the safety boundary.

### Exit

38. As a developer, I want to start a ticket with Claude Code, stop it, change a requirement, and have Codex finish it, answering every permission prompt from the queue, so that the M3 promise is proven on a real ticket.

## Implementation Decisions

- **Attention items are derived, not stored.** `core` gains a pure function from the project snapshot (work items, stints with pending permission requests and handoffs, gate readiness, agent availability) plus a small dismissals record, to the list of open attention items. Kinds: `permission`, `handoff-unresolved`, `gate-ready`, `login-required`. Each item has a stable id derived from its source (request id, stint id, work item and stage, agent), so dismissals and answers are idempotent. Dismissals of handoff-unresolved items live in the stint log (an appended entry) or in `.stintwork/local/`, so they survive restarts. The snapshot carries the list; the web app renders it.
- **Permission answers must be reliable.** The M2 exit test saw answers that didn't reach the agent; a server-side cause hasn't been ruled out. Answering returns success only after the decision has been logged and forwarded to the agent. Otherwise it returns an error the queue shows. A regression test drives a real HTTP answer through the server to the fake agent and asserts the decision entry and the agent's receipt. A pending request whose stint has ended is removed from the queue.
- **Developer notes.** Answering a handoff-unresolved item records a note against the work item. The brief compiler adds a "Developer note" section (with the note's time) to the next brief for that work item, after the last handoff. Notes are cleared once a brief that included them starts a stint.
- **Gates in M3 are approvals.** `core` gains gate readiness rules:
  - Implement (Fix, Do) is ready when every ticket is resolved and no stint is running.
  - Clarify, Spec and Tickets are ready when their stage stint has finished with a handoff.
  - Review is ready when its stint finished.

  The server exposes approve and reopen actions. Approve writes the approval and the next stage into `workflow.yaml`, committing it on the work item branch when a worktree exists (ADR 0009) or writing it in the main checkout otherwise. It refuses while a stint is running. Stintwork refuses to change `workflow.yaml` while it has staged, unstaged or untracked changes and asks the developer to commit or discard them first; a missing file is created. Checks-based gates (CI, test results) move to M4 with review.
- **Stage-level stints.** Stints can start on any stage whose skill is defined, with or without a ticket. The brief for a stage-level stint points at the work item's spec (or "no spec yet") and invokes the stage's skill. One active stint per work item still applies.
- **Agents.** `agents` keeps its agent-neutral interface and adds two launchers:
  - Claude Code through `@agentclientprotocol/claude-agent-acp`, pinned, run against the developer's installed `claude` executable and login;
  - Grok Build through its native `grok agent stdio`.

  Each agent gets a **capability profile**: its ACP modes, whether it supports additional directories, its permission option shapes, how declining behaves (Codex's decline ends the turn), and how it reports missing logins. Availability detection checks the executable and runs a cheap login check, with results cached and refreshed on demand. Pin adapter versions and rerun the probe before the exit test (ADR 0002).
- **Permission levels.** `core` gains a pure mapping from (agent profile, level) to (agent mode, Stintwork auto-answer policy):
  - **Ask:** the most restrictive mode the agent offers, and every request is forwarded to the developer.
  - **Edit freely:** edits inside the worktree are allowed, by mode where the agent supports it (Codex "Workspace access", Claude "acceptEdits") or auto-answered by Stintwork. Commands are forwarded.
  - **Autonomous:** edits and commands whose paths or working directory are inside the worktree are auto-answered. Anything outside is forwarded.

  Auto-answers are logged with `automatic: true`. Grok exposes no ACP modes. When the developer's Grok config sets `always-approve`, Stintwork detects it and warns that Grok won't ask, and it doesn't change the developer's global config (ADR 0003). The level is chosen in the brief preview; a project default lives in `.stintwork/config` (created on first change).
- **Agent per stage.** The stage agent picker writes `stages.<stage>.agent` into `workflow.yaml` (same write rules as approvals). Start requests carry the chosen agent and level. The server rejects unavailable agents with the login hint.
- **Notifications.** The web app shows the attention count in the tab title. It offers an opt-in browser notification for new items (permission stays in the browser; there's no server push service).
- **No reattach after restart.** Agent processes end when the server ends. A restarted server keeps marking unfinished stints `interrupted` with a checkpoint (M2). Resuming happens through the next brief. The plan's M3 line about reattaching is dropped.

## Testing Decisions

- **Good tests check external behaviour:** API responses, WebSocket snapshots, files and commits, rendered UI. They don't check internal calls. Each test reads like a user story. Tests that read this repo's own `.scratch/` assert only durable properties (AGENTS.md).
- **Main seam: the server against the scriptable fake ACP agent,** extended with capability profiles that mimic Codex, Claude and Grok (modes, option shapes, decline-ends-turn, auth errors). It covers:
  - attention items appearing and resolving over WebSocket;
  - permission answers reaching the agent (the M2 regression);
  - auto-answers per permission level;
  - gate approve and reopen writing `workflow.yaml`;
  - stage-level stints;
  - agent selection and login refusal;
  - developer notes flowing into the next brief;
  - attention items rebuilt after restart.

  Prior art: the M2 server suites (stints, checkpoint-handoff, stint-permissions, worktree-readiness, work-item-files).
- **Core unit tests:** attention-item derivation, gate readiness, permission-level mapping per profile, and the brief's developer-note section. Prior art: brief, stints and stages tests.
- **Web component tests:** the Needs-you queue (each item kind, answering, dismissing, errors), card badges, tab title, the gate approval view with evidence, the stage agent picker, the permission-level selector with warnings. Prior art: `Board.test.tsx`, `BriefPreview.test.tsx`, `StintStream` tests.
- **Real-agent checks (manual, before exit):** rerun the ACP probe for Claude Code and Grok Build (Grok's ask-mode permissions remain untested while the developer's config is `always-approve`; record that). Then run the exit scenario with real agents.

## Out of Scope

- Checks-based gates, review stints with findings, `gh` checks and PRs, merging, removing worktrees on merge, memory proposals (M4).
- Creating work items and tickets from the UI, including adding a ticket to a work item with an active worktree (M5).
- Steering a running stint with follow-up messages. Developer notes go into the next brief instead.
- Reattaching to agents after a server restart.
- Agents beyond Codex, Claude Code and Grok Build.
- Changing the developer's global agent configs.
- Server-side push notifications, mobile, or email.

## Further Notes

- **Exit test:** a real Stintwork ticket is started with Claude Code at Edit freely, stopped, has a requirement changed (in the worktree, per ADR 0009), and is finished by Codex. Every permission prompt is answered from the Needs-you queue. Then the Implement gate is approved from the queue, and the card moves to Review.
- **Changes to `docs/plan.md` M3:** "agent questions" become handoff-unresolved items answered with developer notes; checks-pass gates move to M4; reattach is dropped. Update the plan when publishing this spec.
- **Grok:** permission behaviour can only be fully tested with Grok in an asking configuration. Don't change the developer's config. Note it as a limit of the evidence.
