# 02 — Work-item diff and review overlay

Status: resolved
Blocked by: none

## What to build

The developer can read a work item's change inside Stintwork (spec user stories 10–12). `git` gains a work-item diff: from the merge base of the work item branch and the main branch to the branch head, as files and hunks with old and new line numbers. Renames and binary files are represented without content. The server exposes it per work item. The web app gets the review overlay: near full screen, modelled on prototype variant B's review view. It has a file list with added and removed counts, and the diff with line numbers. It opens from the drawer for a work item with a worktree. Findings and checks come in later tickets; leave clear places for them.

## Acceptance criteria

- [ ] Git tests: added, removed and changed files with correct line numbers; renames; binary files; an empty diff.
- [ ] Server test: the diff endpoint for a work item with a worktree, and a clear 409 reason for one without.
- [ ] Component tests: the file list, hunks with line numbers, an empty state.
- [ ] In the browser: the overlay shows a real work item's diff.
- [ ] All checks pass.
