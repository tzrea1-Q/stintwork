# 03 — Commit messages for every Stintwork write

Status: resolved
Blocked by: none

## What to build

Approving `cli-help`'s Implement gate in the M3 exit test committed `workflow.yaml` in the worktree with the message "Stintwork setup for work item cli-help", the message for first-stint setup. Each kind of write gets its own message: "Approve <stage> gate for <work item>", "Reopen <stage> gate for <work item>", "Set <stage> agent to <agent> for <work item>", and setup as today.

## Acceptance criteria

- [x] Server tests assert the commit subject for setup, gate approval, gate reopening and agent choice.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex. Every write path now commits with its own subject: setup, "Approve <stage> gate for <slug>", "Reopen <stage> gate for <slug>", "Set <stage> agent to <agent> for <slug>", plus "Record <kind> <id> as <status> for <slug>" for review decisions. Server tests assert each subject. verify.sh passed (757 tests).
