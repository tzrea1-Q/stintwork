# 09 — Pull requests via gh

Status: ready-for-agent
Blocked by: 05, 08

## What to build

Shipping through GitHub when the repo has a GitHub remote (spec user stories 22, 32–35; ADR 0003). Add a scriptable fake `gh` test helper, placed first on PATH as ticket 07 of M2 did for pnpm. It records invocations and returns scripted output for `repo view`, `pr create`, `pr view`, `pr checks` and `pr merge`.

"Open pull request" detects a GitHub remote. It shows a confirmation with the remote, the branch and a generated title and body (from the spec, tickets, review outcome and checks), and only after confirmation pushes (`git push -u`) and runs `gh pr create`. The PR's CI checks are fetched on demand and on a slow refresh, recorded with the PR head commit, and shown beside local checks. "Merge pull request" runs `gh pr merge` with the repository's default method once CI passes and the gate is approved, then reuses ticket 08's cleanup, recording `merged: { at, commit, pr }`.

## Acceptance criteria

- [ ] Server tests with the fake `gh`: no push or PR without confirmation; push and create after confirmation with the generated body; CI checks recorded with the PR head commit; merge refused until CI passes; merge then cleanup and shipped state.
- [ ] Core tests: PR body generation.
- [ ] Component tests: the push confirmation, PR state and CI checks in the panel, and merge.
- [ ] Manual (only on a GitHub repo the developer chooses): open and merge a real PR.
- [ ] All checks pass.
