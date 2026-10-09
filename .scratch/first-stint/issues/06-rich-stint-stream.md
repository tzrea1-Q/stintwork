# 06 — Rich stint stream

Status: ready-for-agent
Blocked by: 03

## What to build

The stream shows what the agent is actually doing (spec user stories 14–16, 32). Visual reference: prototype variant B's run view.

- A plan, with steps ticking off as the agent updates it.
- Tool calls with title, kind and status. Long output is collapsed and expandable.
- File edits, with paths.
- Permission requests inline with Allow once and Deny. The answer goes back over ACP and is recorded in the stint log.
- A running indicator on the work item's card on the board.

## Acceptance criteria

- [ ] Server test: a fake agent that requests permission waits for the answer; Allow and Deny each reach the agent and are logged.
- [ ] Core test: plan, tool-call, tool-call-update and file events fold into the latest state per plan and tool call.
- [ ] Component tests: each event kind renders, tool output collapses and expands, and the permission prompt sends the chosen option.
- [ ] Component test: a card with an active stint shows the running indicator.
