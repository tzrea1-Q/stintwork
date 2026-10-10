# 05 — Checks

Status: resolved
Blocked by: 02

## What to build

Evidence instead of claims (spec user stories 18–21). `.stintwork/config` gains `checks:`, a list of named commands. The default is the root `package.json` scripts test, lint, typecheck, build and format:check, in that order, when present. "Run checks" executes them one after another in the work item's worktree. It records the commit at start, streams output over WebSocket, can be cancelled, and appends results (name, status, duration, output excerpt, commit) to a check log under `.stintwork/local/checks/`. The review overlay gets a checks panel showing the latest run per check, with its commit.

## Acceptance criteria

- [x] Server tests: default and configured commands. Results are tied to the commit, output streams, cancellation works, a failing check is recorded as failed, and the log survives a restart.
- [x] Component tests: the checks panel (running, passed, failed, cancelled).
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex. verify.sh passed (783 tests). Browser check on a throwaway repo (root package.json scripts test: sleep 3, lint: ok, build: exit 1, no checks: in config, so the defaults were used): Run checks in the review overlay streamed test's output live with a Cancel button, then recorded test passed (3177 ms), lint passed and build failed, each with the worktree's commit a5689d2. A new commit on stintwork/demo marked all three Stale within about two seconds without a reload. Check commands are read from the main checkout's .stintwork/config, never from the worktree.
