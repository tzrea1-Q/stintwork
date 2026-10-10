# 10 — Permission levels

Status: resolved
Blocked by: 03, 07, 08

## What to build

A stint's permission level means the same thing for every agent (spec user stories 32–37). `core` gains a pure mapping from (agent profile, level) to (agent mode, Stintwork auto-answer policy):

- **Ask:** the most restrictive mode, and every request is forwarded.
- **Edit freely** (default): edits inside the worktree are allowed by mode where possible (Codex "Workspace access", Claude "acceptEdits") or auto-answered. Commands are forwarded.
- **Autonomous:** edits and commands inside the worktree are auto-answered.

Anything outside the worktree is always forwarded. Auto-answers are logged as `automatic: true`. The brief preview gets a level selector with a project default (`.stintwork/config`). It warns when an agent can't honour the level (Grok with always-approve; Codex's sandbox running commands without asking).

## Acceptance criteria

- [ ] Core tests: the mapping for every profile and level, including the always-outside-the-worktree rule.
- [ ] Server tests per fake profile: Ask forwards everything. Edit freely auto-answers in-worktree edits and forwards commands. Autonomous auto-answers in-worktree commands and forwards an outside path. Every auto-answer is logged.
- [ ] Component tests: the selector, the project default, and the warnings.
- [ ] All checks pass.

## Comments

**2026-10-10 · implemented by Codex, verified by coordinator.** Also folds in three display fixes found while verifying: readable permission details (full JSON behind a disclosure), Grok's byte-array tool output decoded, and options covered by tests on permission items. The coordinator changed two things:

1. Ask mapped Claude to `plan`, which forbids changes altogether. Ask now uses Claude's `default` mode, which asks before every change.
2. Server tests depended on the machine's real agents, because the default registry probed `claude` and `grok`. Under heavy load that timed out tests and made results depend on local logins. A server-test setup now skips detection in the default registry. Detection tests use explicit registries.

All checks pass, 654 tests.
