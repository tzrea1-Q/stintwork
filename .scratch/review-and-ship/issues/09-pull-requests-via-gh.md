# 09 — Pull requests via gh

Status: ready-for-human
Blocked by: 05, 08

## What to build

Shipping through GitHub when the repo has a GitHub remote (spec user stories 22, 32–35; ADR 0003). Add a scriptable fake `gh` test helper, placed first on PATH as ticket 07 of M2 did for pnpm. It records invocations and returns scripted output for `repo view`, `pr create`, `pr view`, `pr checks` and `pr merge`.

"Open pull request" detects a GitHub remote. It shows a confirmation with the remote, the branch and a generated title and body (from the spec, tickets, review outcome and checks), and only after confirmation pushes (`git push -u`) and runs `gh pr create`. The PR's CI checks are fetched on demand and on a slow refresh, recorded with the PR head commit, and shown beside local checks. "Merge pull request" runs `gh pr merge` with the repository's default method once CI passes and the gate is approved, then reuses ticket 08's cleanup, recording `merged: { at, commit, pr }`.

## Acceptance criteria

- [x] Server tests with the fake `gh`: no push or PR without confirmation; push and create after confirmation with the generated body; CI checks recorded with the PR head commit; merge refused until CI passes; merge then cleanup and shipped state.
- [x] Core tests: PR body generation.
- [x] Component tests: the push confirmation, PR state and CI checks in the panel, and merge.
- [ ] Manual (only on a GitHub repo the developer chooses): open and merge a real PR.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex; the coordinator changed the PR body's empty-checks text from "No local checks configured." to "No local check results recorded." (it showed even with checks configured but not yet run). verify.sh passed (1223 tests). Browser and API check in a throwaway repo with a local bare repository as origin and the fake gh first on PATH: Open pull request showed the confirmation (remote, branch, head commit, title, generated body with spec, tickets, review and checks). Before confirming, the remote had only main and gh had been asked only for repo view. After confirming, stintwork/feature was pushed and gh pr create got the generated body; the panel showed "Pull request #12". merge-pr with pending CI returned 409 ("Every pull request CI check must pass…") without calling gh pr merge. After CI passed, merge-pr ran `gh pr merge 12 --merge --match-head-commit <head>` (no --admin), fast-forwarded main, committed "Record merge of feature" with merged { at, commit, pr: 12, method: merge }, and removed the worktree and branch. A repeated merge-pr returned the same record with no duplicate commit. Still open: the manual criterion, opening and merging a real PR on a GitHub repo the developer chooses (to be done in the M4 exit, with the developer's permission, because it publishes code).
