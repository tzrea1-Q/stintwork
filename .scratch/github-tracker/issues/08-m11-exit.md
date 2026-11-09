# 08 — M11 exit

Status: ready-for-human
Blocked by: 01, 02, 03, 04, 05, 06, 07, 13, 14, 15, 16, 18

## What to build

After all prerequisites and ADR approval, the coordinator asks the maintainer which real GitHub-tracked repo to use. It needs an existing authenticated github.com login, authorized issue and PR write/merge access, a qualifying parent (a top-level issue with direct same-repo sub-issues or the `stintwork:work-item` label) with a spec body and a direct same-repo ticket to implement, a suitable workflow and checks, and permission to use and clean up the chosen work. Use the actual built revision and take one ticket from the board through a real agent stint, checks, PR and merge. Real gh, provider network, local sockets and browser are required. Do not inspect or record credentials.

## Acceptance criteria

- [x] Tickets 01–07 and 13 are resolved, the approved ADR and fixture, build and browser evidence are linked.
- [x] The selected repo and permission are confirmed with the maintainer; record repository and issue/PR identities and tested revision.
- [x] Board discovery, ticket dependencies, brief and real stint are observed; issue changes are made by the agent through its own skill/gh.
- [x] A real PR for the ticket passes required checks on its current head and is merged; record URLs, commits and check outcomes.
- [x] A remote edit and refresh demonstrate approval invalidation or a separately authorized disposable issue demonstrates it; failure and recovery are observed.
- [ ] Record actual timing/request counts, browser evidence, cleanup, failures and limits; no credentials or private content are copied.
- [ ] Only the maintainer accepted full pass sets M11 shipped; otherwise leave active with concrete blockers.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Coordinator, 2026-11-07:** Live exit evidence. Maintainer-approved repository `tzrea1-Q/stintwork-m11-exit` (`R_kgDOVexdHQ`), using the existing `gh` login; no credentials were read or recorded. Tested revision: `9a69545` (built `dist`, served from the main checkout), feature workflow, agent Codex. Prerequisites 01–07, 13, 14, 15, 16 and 18 are resolved.

- **Discovery and brief.** The board discovered parent [#1](https://github.com/tzrea1-Q/stintwork-m11-exit/issues/1) with direct sub-issues #2 and #3, where #3 is blocked by #2 through a native dependency. Every issue write was made by the agent through its skill and `gh`, and the coordinator reviewed each permission request before allowing it once.
- **Stages.**
  - Memory proposals were accepted (`3a78e56`, `958ec1b`).
  - Spec was approved at `b91d3e5`, after ADR 0015.
  - The Tickets stint published free-text Blocked-by sections, which exposed the ticket 16 deadlock. After the fix, a rerun corrected the sections and Tickets was approved at `aef02b1` (v2).
- **Ticket #2.** Implemented in `e726b0e`, then commented and closed by the agent. A GitHub connection failure interrupted the close; after a server restart, stint `ee87b37f` recovered (suspended, then resumed in the same session) and finished the close.
- **Remote edit invalidates approval, then recovery.** #2's completion comment made the v2 Tickets approval stale, and starting #3 was refused with "GitHub evidence changed since review." This led to ADR 0016 and ticket 18. Recovery: Tickets was reopened (`5d8635c`), Tickets stint `a7bcfc94` ran, and Tickets was re-approved under v3 (`9ddf7c1`).
- **Ticket #3.** Started without re-approval. One start auto-stopped 0.5 s in (`60da42e3`, ticket 17); the retry `f59b29d1` implemented `0d9b50f`, then commented and closed #3. Clarify, Spec and Tickets all stayed "Approval is current" afterwards.
- **Implement, Review and checks.** Implement was approved at `c08c523`. Review stint `755dcae8` found nothing on Standards or Spec. The configured check `npm run test` passed 3/3 on `c08c523` in 225 ms. Review was approved at `7f44df5`.
- **Ship.**
  - Stintwork's PR flow pushed `stintwork/github-1` and opened [PR #4](https://github.com/tzrea1-Q/stintwork-m11-exit/pull/4) at head `7f44df5`. The PR CI check `test` passed (run 42445541314).
  - PR #4 was merged at `faacd9f` (2026-11-08T04:15:41Z), and post-merge CI on main passed (run 42446085927).
  - Stintwork recorded the merge locally in `185c67e` and removed the worktree and local branch. The item now shows Shipped, with Needs you at 0.
- **Timings and requests.** Measured with a `gh` shim that logs only arguments and durations, server restarted at the same revision:
  - Cold start made 7 calls in 15.1 s.
  - Opening the shipped item's detail made 15 calls in about 17 s.
  - A manual Refresh took 9.1 s and made 5 calls.
  - In total, 48 calls over 161 s, of which 24 were identity checks. Each `gh` call took 1.1–1.7 s.
  - Earlier: Ship preview, PR checks refresh and merge preview each took about 60–100 s; detail reads took 10–18 s.
- **Browser.** Board at 1440×900; board and detail drawer at 390×844, with no horizontal overflow (`scrollWidth` 390). Screenshots are kept outside the repo.
- **Failures and limits.** These are filed as ticket 17 items: the 60 s re-verify blanks the board; a stint start was silently aborted; repeated adapter confirmation; "02" shown instead of "#2"; slow detail; an unnoticed permission wait; stale handoff items; misleading gate readiness during a write; "changed since handoff" not reporting changes; serial recovery at startup; Reopen disabled under unknown dependencies; PR-checks polling that blocks Merge; slow Ship actions without progress; a silent 409 on Refresh; per-request identity checks; a transient incomplete banner; an empty shipped drawer; and parent #1 left open after the merge.
- **Pending.** Cleanup: the exit repository, the remote branch `stintwork/github-1`, the unpushed local record commit and open parent #1 are kept until the maintainer decides. The maintainer's decision on M11 shipped is also pending.

**Coordinator, 2026-11-08:** Maintainer decisions:
- M11 stays active until ticket 17 is resolved and a short retest in the exit repository passes.
- Cleanup then archives `tzrea1-Q/stintwork-m11-exit`, after closing parent #1 and deleting the remote branch `stintwork/github-1`. Archiving waits for the retest because an archived repository is read-only.

**Coordinator, 2026-11-09:** Short retest after ticket 17, as the maintainer required ("Ship after 17"). Tested revision `ade3b5f` (built `dist`, served from the main checkout), feature workflow, agent Codex 0.163.0 with adapter 2.1.1, same repository and `gh` login; no credentials were read or recorded.

- **Flow.** The coordinator opened parent [#5](https://github.com/tzrea1-Q/stintwork-m11-exit/issues/5) with the `stintwork:work-item` label. Clarify ran twice (two questions, answered through a developer note), with memory proposals for GLOSSARY and ADR 0002 accepted. Spec rewrote #5's body. Tickets published [#6](https://github.com/tzrea1-Q/stintwork-m11-exit/issues/6) as a direct sub-issue after the breakdown was approved in a developer note. Implement committed `c4a7f59`, then commented on and closed #6. Review reported no findings, and the `test` check passed. Every gate was approved in Stintwork (`2ad5c76`, `7c5b819`, `2c61e6b`, `675efc3`, `75e5258`). Every agent issue write went through the agent's skill and `gh`, and the coordinator reviewed each request and allowed it once.
- **Ship.** The PR preview body ended with `Closes #5`. [PR #7](https://github.com/tzrea1-Q/stintwork-m11-exit/pull/7) passed CI (`test`) on head `75e5258` and was merged through Stintwork. GitHub closed #5 as completed by PR #7 (ADR 0017). Stintwork recorded the merge (`671cd14`) and removed the worktree and the local branch.
- **Ticket 17 fixes confirmed live.**
  - The board did not blank.
  - The adapter was confirmed once after the server restart, then shown as Ready.
  - The permission banner and tab-title marker appeared.
  - Approval progress ("Approving…") and Ship progress ("Verifying GitHub evidence and checking readiness…") were shown.
  - Unresolved handoff items cleared on gate approval.
  - Approvals stayed current after ticket comments and the close (evidence v3).
  - The ticket section showed `#6`.
  - PR checks polling did not block Merge.
- **Timing.** 550 `gh` calls in 63 minutes, with a mean of 1.49 s each. 4 failed, all expected: two `pr view <branch>` lookups before a PR existed, and two branch-protection reads on an unprotected `main`. There were 94 identity checks, about one every 40 seconds. Building the PR preview took about 20 s and the merge confirmation about 25 s.
- **New defects.** Filed as ticket 19:
  - After a board Refresh, a changed item stays stale until its drawer is opened. Meanwhile it shows "Blocked", and handoff items already cleared by gate approvals reappear.
  - The merge button reads "Confirm merge merge".
  - The gate's ticket list shows `6 ·` instead of `#6`.
  - The Ship previews are slow because their `gh` reads run serially and repeat.
- **Pending.** Cleanup is not done yet: close #1, delete the remote branches `stintwork/github-1` and `stintwork/github-5`, and archive the repository (maintainer decision of 2026-11-08). The local record commits `185c67e` and `671cd14` remain unpushed. The maintainer then decides M11 shipped.
