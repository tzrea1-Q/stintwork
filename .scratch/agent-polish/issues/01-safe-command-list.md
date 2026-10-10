# 01 — Safe command list at Edit freely

Status: resolved
Blocked by: none

## What to build

`docs/plan.md` (Settled, item 3) defines Edit freely as edits in the worktree without asking, with commands outside a safe list asked about. M3 ticket 10 forwards every command instead. In the M3 exit test, Claude Code asked 18 times in one stint, mostly for read-only commands such as `cat`, `ls`, `sed -n`, `git diff`, `git status` and `pnpm vitest run` inside the worktree.

Add a safe list to the permission-level policy:
- read-only inspection (`cat`, `ls`, `head`, `tail`, `sed -n`, `grep`/`rg`, `wc`, `git status|diff|log|show`);
- the project's own check scripts (`pnpm test|lint|typecheck|format:check|build` and their `vitest`/`tsc`/`biome` forms);

only when the command's working directory is inside the worktree and it doesn't pipe into writes outside it. Commands with redirection outside the worktree, network access, or unknown binaries stay manual. Auto-answers are logged as automatic.

## Acceptance criteria

- [x] Core tests: the classification of safe, unsafe and borderline commands (pipes, redirects, `cd` outside, `&&` chains with one unsafe part).
- [x] Server tests with the Claude fake profile: safe commands are auto-answered and logged; others reach the queue.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex in three rounds. Round 1 required a cwd, but real Claude Code Bash requests carry none, so nothing from Claude was ever auto-answered. Round 2 resolves a missing cwd against the stint's worktree and allows a trailing 2>&1. Round 3, after a real Claude stint at Edit freely asked 6 times with 0 automatic answers because Claude chains commands with ; and echo "exit=$?": ; separates segments like &&, literal echo and the exact $? token are allowed, and node/pnpm/git --version are safe. Coordinator probes: $(…), ${…}, $VAR, other redirects, ||, &, newlines, git -c, --ext-diff, rg --pre, git log --output= and env stay manual; paths such as /etc/passwd and .. are returned for the worktree check to refuse. verify.sh passed (954 tests). Second real Claude stint (charcount): 5 prompts, 0 automatic, and every prompt contained an unsafe part (node <file>, sed -i, git add -N, a python heredoc). Pure inspection chains (git diff HEAD; ls -a; cat package.json) never reached Stintwork, because Claude Code's own read-only check already allows them in acceptEdits mode. So the safe list mainly matters for Codex requests and older Claude versions; the server tests prove the automatic path end to end with the Claude profile.
