# 07 — Worktree readiness and repo writes

Status: resolved
Blocked by: 03

## What to build

Stints work in real repos, and Stintwork's first writes are safe and visible (spec user stories 10–13, 28–31; ADR 0003).

- **Dependencies:** install them in a new worktree when a pnpm, npm or yarn lockfile is present, offline first and then online. The setup progress shows in the stream.
- **Git access:** grant the worktree's git directory to the agent as an additional writable directory (ACP additional directories), so the agent's own commits succeed.
- **Login check:** when Codex isn't installed or isn't logged in, refuse to start, with a message naming the command to run (`codex login`).
- **First repo writes:** on a work item's first stint, write `workflow.yaml` with its workflow, stage and agent. Add `.stintwork/local/` to `.gitignore` when missing, and tell the developer.
- **One stint at a time:** one active stint per work item; a second start is refused with a clear message. Stints on different work items can run at the same time.

## Acceptance criteria

- [ ] Server test: a temp repo with a pnpm lockfile gets its dependencies installed in the new worktree before the agent starts (use a tiny fixture package).
- [ ] Server test: the fake agent's request for additional directories includes the git directory, and a commit made in the worktree during the stint succeeds.
- [ ] Server test: an "auth required" error from the agent refuses the start with a `codex login` hint.
- [ ] Server test: the first stint writes `workflow.yaml` and the `.gitignore` entry exactly once. A second concurrent start on the same work item is refused, while a start on another work item succeeds.
