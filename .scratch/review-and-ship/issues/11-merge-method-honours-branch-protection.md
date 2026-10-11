# 11 — Merge method honours branch protection

Status: ready-for-agent
Blocked by: 09

## What to build

Found with the real PR test on `tzrea1-Q/strandry` (ticket 09). That repo allows merge, squash and rebase, its viewer default merge method is MERGE, and its `main` branch protection requires linear history. Stintwork picks the viewer default (or the first allowed method), so it would run `gh pr merge --merge`, which GitHub rejects for a linear-history branch. Before merging, read the base branch's protection where `gh` can (`gh api repos/<repo>/branches/<base>/protection`; a 404 or 403 means unknown), and when linear history is required, choose squash or rebase (whichever is allowed, preferring the default if it qualifies). If no allowed method satisfies the protection, refuse with a reason naming the rule. Show the chosen method in the merge confirmation.

## Acceptance criteria

- [ ] Server tests with the fake `gh`: linear history plus a MERGE default picks squash (or rebase when only rebase is allowed); unreadable protection keeps today's choice; no qualifying method refuses without calling `gh pr merge`.
- [ ] The merge action shows the method it will use.
- [ ] All checks pass.
