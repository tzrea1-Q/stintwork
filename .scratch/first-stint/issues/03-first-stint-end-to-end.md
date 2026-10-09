# 03 — First stint, end to end

Status: ready-for-agent
Blocked by: 02

## What to build

The tracer bullet. From the brief preview, "Start stint" with Codex:

1. creates (or reuses) the work item's worktree and branch (`<repo>-worktrees/<work-item>`, branch `stintwork/<work-item>`);
2. launches the Codex ACP adapter in that worktree and sends the brief;
3. streams the agent's messages live into the drawer;
4. ends as `finished` when the agent's turn ends.

Every stint event is appended to a JSONL stint log under `.stintwork/local/stints/`. The work item's stint history in the drawer lists the stint (agent, ticket, status, times), and the snapshot carries stints per work item.

The `agents` package exposes an agent-neutral interface with a Codex implementation. The `git` package handles worktrees. Build a **scriptable fake ACP agent**, grown from `spikes/acp-probe`'s fake agent, as the main test seam: tests swap it in for Codex.

## Acceptance criteria

- [ ] Server test, with the fake agent on a temp git repo: start a stint, receive its message events over WebSocket in order, and see it end `finished`. The stint log exists, the worktree and branch exist, and the snapshot lists the stint under its work item.
- [ ] A second start on the same worktree reuses it.
- [ ] Core tests: folding a stint log into a Stint (status, times, events).
- [ ] Component tests: the drawer shows a live stint with streaming messages, then a finished stint in history.
- [ ] Manually with real Codex on a scratch repo: a stint runs and finishes, and messages stream in the drawer.
