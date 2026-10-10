# 08 — Local merge and cleanup

Status: resolved
Blocked by: 07

## What to build

Shipping without leaving Stintwork, for any repo (spec user stories 36–39). From the Ship stage, "Merge locally" first runs a dry-run merge of the work item branch into the main branch and reports conflicts with a send-back option. It refuses while memory proposals are open, a stint is running, or the main checkout has uncommitted changes to files the merge touches. It then merges into the main branch in the main checkout (fast-forward when possible, otherwise a merge commit naming the work item), and records `merged: { at, commit }` in `workflow.yaml` on the main branch. Finally it removes the work item's worktree and branch (with the per-repo lock) and marks the work item shipped. The history, findings and checks remain visible afterwards.

## Acceptance criteria

- [x] Git tests: dry-run conflict detection, fast-forward and merge-commit paths, worktree and branch removal.
- [x] Server tests: merge refused for each blocking condition. A successful merge records `merged` and removes the worktree and branch. The snapshot shows the work item shipped with its history intact.
- [x] Component tests: the Ship actions, the conflict report, and the refusal reasons.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex (it also fixed 07's wording nit: after a reopen the review condition asks for a new Review stint). verify.sh passed (1185 tests). Real check on adder in a throwaway repo: a new real Codex review stint (no findings), checks passed, and Review approved, moving the item to Ship. A conflicting add.js commit on main made Merge locally report "Merge conflicts: add.js" with Send back, leaving the main checkout untouched (no MERGE_HEAD, clean status). With that commit removed, Merge locally created "Merge work item adder" (two parents) plus a separate "Record merge of adder" commit with merged: { at, commit } in workflow.yaml on main. It removed the worktree and the stintwork/adder branch. The board showed the item Shipped ("Shipped locally at f2a084b"); the snapshot kept 4 stints, 2 review decisions and the check evidence, with no warnings. Note: the dry run uses git merge-tree --write-tree (Git 2.38+).
