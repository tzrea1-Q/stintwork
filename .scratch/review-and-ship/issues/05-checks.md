# 05 — Checks

Status: ready-for-agent
Blocked by: 02

## What to build

Evidence instead of claims (spec user stories 18–21). `.stintwork/config` gains `checks:`, a list of named commands. The default is the root `package.json` scripts test, lint, typecheck, build and format:check, in that order, when present. "Run checks" executes them one after another in the work item's worktree. It records the commit at start, streams output over WebSocket, can be cancelled, and appends results (name, status, duration, output excerpt, commit) to a check log under `.stintwork/local/checks/`. The review overlay gets a checks panel showing the latest run per check, with its commit.

## Acceptance criteria

- [ ] Server tests: default and configured commands. Results are tied to the commit, output streams, cancellation works, a failing check is recorded as failed, and the log survives a restart.
- [ ] Component tests: the checks panel (running, passed, failed, cancelled).
- [ ] All checks pass.
