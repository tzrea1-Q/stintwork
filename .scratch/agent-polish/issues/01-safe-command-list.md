# 01 — Safe command list at Edit freely

Status: ready-for-agent
Blocked by: none

## What to build

`docs/plan.md` (Settled, item 3) defines Edit freely as edits in the worktree without asking, with commands outside a safe list asked about. M3 ticket 10 forwards every command instead. In the M3 exit test, Claude Code asked 18 times in one stint, mostly for read-only commands such as `cat`, `ls`, `sed -n`, `git diff`, `git status` and `pnpm vitest run` inside the worktree.

Add a safe list to the permission-level policy:
- read-only inspection (`cat`, `ls`, `head`, `tail`, `sed -n`, `grep`/`rg`, `wc`, `git status|diff|log|show`);
- the project's own check scripts (`pnpm test|lint|typecheck|format:check|build` and their `vitest`/`tsc`/`biome` forms);

only when the command's working directory is inside the worktree and it doesn't pipe into writes outside it. Commands with redirection outside the worktree, network access, or unknown binaries stay manual. Auto-answers are logged as automatic.

## Acceptance criteria

- [ ] Core tests: the classification of safe, unsafe and borderline commands (pipes, redirects, `cd` outside, `&&` chains with one unsafe part).
- [ ] Server tests with the Claude fake profile: safe commands are auto-answered and logged; others reach the queue.
- [ ] All checks pass.
