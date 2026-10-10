# 08 — Local merge and cleanup

Status: ready-for-agent
Blocked by: 07

## What to build

Shipping without leaving Stintwork, for any repo (spec user stories 36–39). From the Ship stage, "Merge locally" first runs a dry-run merge of the work item branch into the main branch and reports conflicts with a send-back option. It refuses while memory proposals are open, a stint is running, or the main checkout has uncommitted changes to files the merge touches. It then merges into the main branch in the main checkout (fast-forward when possible, otherwise a merge commit naming the work item), and records `merged: { at, commit }` in `workflow.yaml` on the main branch. Finally it removes the work item's worktree and branch (with the per-repo lock) and marks the work item shipped. The history, findings and checks remain visible afterwards.

## Acceptance criteria

- [ ] Git tests: dry-run conflict detection, fast-forward and merge-commit paths, worktree and branch removal.
- [ ] Server tests: merge refused for each blocking condition. A successful merge records `merged` and removes the worktree and branch. The snapshot shows the work item shipped with its history intact.
- [ ] Component tests: the Ship actions, the conflict report, and the refusal reasons.
- [ ] All checks pass.
