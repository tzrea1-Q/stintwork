# 10 — Permission levels

Status: ready-for-agent
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
