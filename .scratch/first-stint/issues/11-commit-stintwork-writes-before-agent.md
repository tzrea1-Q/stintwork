# 11 — Commit Stintwork's own worktree writes before the agent starts

Status: ready-for-agent
Blocked by: none

## What to build

On a work item's first stint, Stintwork writes `workflow.yaml` and the `.gitignore` entry for `.stintwork/local/` in the work item's worktree (tickets 07 and 10). It leaves them untracked when the agent starts. In a real Codex stint the agent noticed them, reported them in its handoff as "untracked and left untouched", and they were only committed later by the stint's checkpoint. The agent should start from a clean worktree containing only its own work to do.

- After Stintwork's first-stint writes in the worktree, and before launching the agent, commit exactly those files on the work item branch, with a message saying they are Stintwork's setup for the work item.
- Make no commit when there is nothing new (later stints, or files already committed).
- Never include other uncommitted changes in that commit. If the worktree has unrelated uncommitted changes, leave them as they are.

## Acceptance criteria

- [ ] Server test: on a work item's first stint, the agent starts with a clean `git status` in the worktree, and the branch has one setup commit containing exactly `workflow.yaml` and `.gitignore`.
- [ ] Server test: a second stint on the same work item makes no setup commit.
- [ ] Server test: an unrelated uncommitted file in the worktree stays uncommitted and isn't part of the setup commit.
- [ ] All checks pass: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
