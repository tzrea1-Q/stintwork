# 13 — Keep local data out of the project's Git

Status: resolved
Blocked by: none

## What to build

Stintwork runs in the developer's own project, so what it writes must land in Git only on purpose (ADR 0001: durable state in the repo, `.stintwork/local/` gitignored). A code review on 2026-10-11 found three gaps:

1. **Check logs and PR-check records can be left untracked but not ignored.** Stint logs call the ignore step before writing, but check logs (`.stintwork/local/checks/`) and PR CI records (`.stintwork/local/pr-checks/`) don't. In a project without guided setup, running checks before any stint leaves untracked files that `git add -A` would commit.
2. **The first stint edits the main checkout's `.gitignore` without committing it.** That leaves a surprise modification to a tracked file, and probably makes Merge locally refuse later because the work item branch commits the same `.gitignore` change (unconfirmed: reproduce it first).
3. **Checkpoints commit everything not ignored.** The end-of-stint checkpoint runs `git add --all` in the worktree, so a stray `.env`, credentials, build output or large generated file an agent leaves behind goes onto the work item branch with no warning.

Fix:
- `.stintwork/local/` ignores itself: whenever Stintwork creates it (stint logs, check logs, PR-check records, anything else), it writes `.stintwork/local/.gitignore` containing `*`. No local-data path depends on the project's `.gitignore`.
- Stintwork no longer edits the main checkout's `.gitignore` behind the developer's back. Guided setup keeps offering the entry as a previewed, confirmed change. Decide (and record in Comments) whether the worktree still needs its own `.gitignore` commit once the folder ignores itself; prefer not touching the project's `.gitignore` at all outside setup.
- The checkpoint still commits the agent's work, but flags risky paths before they reach the branch. Risky paths are likely secrets (`.env*`, `*.pem`, `*.key`, `id_rsa*`, files named like credentials or tokens), files above a size threshold (e.g. 1 MB), and common generated directories (`node_modules/`, `dist/`, `build/`, `coverage/`). Flagged paths are recorded on the stint's `ended` entry, shown in the handoff card and the review overlay, and raise a Needs you attention item. Never print file contents. Decide (and record) whether likely secrets are excluded from the checkpoint and left uncommitted, rather than only flagged; prefer excluding them.

## Acceptance criteria

- [x] Server tests reproduce each gap first: check logs untracked without setup, the main checkout's `.gitignore` modified after a first stint (and whether Merge locally then refuses), and a stray `.env` committed at a checkpoint. All three fail before the fix.
- [x] After the fix: `git status` in a fresh project with no setup stays clean after stints and checks; the main checkout's `.gitignore` is untouched outside setup; risky paths are flagged and handled as decided; Merge locally works on a project without setup.
- [x] Component tests: flagged paths in the handoff card and the review overlay, and the attention item.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex in two rounds; verify.sh passed (1664 tests). Codex reproduced all three gaps with failing tests first, including the suspected Merge locally refusal (confirmed). Decisions: Stintwork no longer commits a worktree `.gitignore` outside guided setup, because `.stintwork/local/` ignores itself; checkpoints exclude (not just flag) likely secrets, files over 1 MiB and generated directories.

Real checks on fresh projects with no setup, using real Codex stints on a ticket asking for a `.env` (dummy token) and `dist/bundle.js`:
- **Round 1:** the main checkout stayed clean, its `.gitignore` was untouched, and `.stintwork/local/.gitignore` was `*`. But the agent committed `.env` and `dist/` itself, so nothing was flagged. Gap 3 was not closed.
- **Round 2 (fix):** every commit a stint adds is scanned; committed risky paths are recorded with their commits; a Review gate condition "No risky files on the branch" (merge base to head) blocks shipping; a per-path Accept with a reason is recorded in review.yaml and bound to the file's blob; and every brief tells agents not to commit secrets or build output.
- **Recheck:** the agent left `.env` and `dist/` uncommitted; the checkpoint excluded them; Needs you showed "Risky files excluded from checkpoint" with the next step. Committing `.env` by hand made the Review condition fail with remediation (including rotating real secrets). Accepting it (reason "Test fixture with a dummy value") cleared the condition. Changing `.env` blocked it again. Detection is by path and size, not content.
