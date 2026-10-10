# 06 — Rich stint stream

Status: resolved
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

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** All checks pass alone (212 tests). Merging with ticket 04 conflicted in five lifecycle files; the Codex session that wrote this ticket resolved them, adding four regression tests that caught two interaction bugs (cancellation leaking into the handoff request; handoff timeouts leaving permission requests pending). Merged result: 248 tests. Real Codex stint: a permission request ("Run command") appeared with Codex's real options, Allow once was answered through the new endpoint, and Codex then committed its own work.
