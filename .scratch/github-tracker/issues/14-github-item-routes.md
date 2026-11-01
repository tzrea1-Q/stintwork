# 14 — Resolve GitHub work items in server routes

Status: ready-for-agent
Blocked by: 13

## What to build

The real-repository exit found that accepting a memory proposal for a GitHub work item returns "Work item not found". Audit server routes that index only local Markdown and use the current GitHub-aware project snapshot consistently. Preserve local behavior and route GitHub gates through their existing routes.

Use the identity-bound GitHub workflow record for stage and workflow writes, and require current remote identity and evidence for Ship actions that depend on GitHub approvals. Preserve existing write safeguards.

## Acceptance criteria

- [x] Memory proposals, stage-agent choice, diff, checks, finding decisions, Ship, roadmap and stint finalisation and recovery resolve GitHub items.
- [x] GitHub workflow writes use the identity-bound record and remote-dependent actions fail closed on stale or unavailable evidence.
- [ ] Fake-gh route tests cover the GitHub paths and local route tests remain passing.
- [x] The indexProject and workflow-path call sites are audited and requested checks are recorded.

## Comments

**Codex, 2026-11-01:** Partial implementation. Memory proposal decisions use the live GitHub-aware snapshot, and review writes can create a missing per-item review directory. This is not yet verified with fake GitHub data and the ticket remains open.

Audit of non-test `indexProject` call sites: `brief-preview.ts` has the existing GitHub-specific projection; `create-work-item.ts` refuses a GitHub tracker before indexing; `memory-proposals.ts` now uses the GitHub snapshot for GitHub trackers. `checks.ts`, `finding-decisions.ts`, `stage-agent.ts`, `ship.ts` (all three calls), `roadmap.ts`, `work-item-diff.ts`, and the recovery calls in `stints.ts` still need the shared resolver. The stage-changed check in `stints.ts` already uses the GitHub snapshot for GitHub items. `gates.ts` still needs an explicit GitHub refusal. `index.ts` builds the live projection. Ship and review send-back workflow paths and remote evidence checks still need work; the `.scratch` path audit is not complete.

Checks run: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), `pnpm typecheck`, and `pnpm vitest run packages/git/src/review.test.ts packages/server/src/memory-proposals.test.ts` (14 passed). No socket failures occurred in these checks. The requested new fake-gh route test has not been written.

**Codex, 2026-11-01:** Stage B: extracted the GitHub-aware snapshot resolver and applied it to memory proposals, checks, finding decisions, stage-agent choice, roadmap assignment and work-item diff; local trackers still index the current project files. The local gate routes now refuse GitHub slugs and point to the GitHub gate routes. Stage-agent writes use the identity-bound GitHub workflow and existing protected writer. Review decisions remain under `.scratch/<slug>/review.yaml`, as in the review writer; Review send-back reads the identity-bound GitHub workflow and commits it atomically with the review record. Fake-gh route coverage exercises these paths, including acceptance and rejection of memory proposals.

Call-site audit: `brief-preview.ts` retains its GitHub projection; `create-work-item.ts` refuses GitHub trackers; `index.ts` builds the live snapshot; the stage-changed check in `stints.ts` already uses it. `ship.ts` (three calls), stint recovery calls in `stints.ts`, and Ship workflow/evidence handling remain Stage C work. This comment does not mark the ticket complete.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested Vitest command passed 109 tests; its sole failure was `checks.test.ts` WebSocket streaming, where the sandbox rejected `listen 127.0.0.1` with `EPERM`. The new GitHub route test passed all 4 cases separately as well; `pnpm vitest run packages/git/src/review.test.ts` passed all 8 tests.


**Codex, 2026-11-01:** Stage C uses the shared snapshot in Ship and stint recovery; startup waits for GitHub discovery before adopting interrupted stints. Ship checks remote identity, freshness and prior approvals, writes the identity-bound GitHub workflow, and preserves its exact workflow path during PR cleanup. Fake-gh route tests cover proposal decisions, stage agent, diff, checks, review findings, roadmap, local gate refusal, stale Ship refusal, local and PR Ship, and recovery finalisation.

Final call-site audit: `project-snapshot.ts` indexes local files; `index.ts` constructs the live projection; `brief-preview.ts` indexes local files and separately builds its verified GitHub projection; `create-work-item.ts` refuses GitHub trackers before indexing. Remaining local workflow paths in `gates.ts`, `approval-head.ts`, `stage-agent.ts`, `finding-decisions.ts`, `ship.ts`, `stints.ts`, and `workflow-writes.ts` are limited to local items or their local-only branches. `review-evidence.ts` uses the local workflow path as a diagnostic warning label, while Ship also checks the item evidence error directly. The `.scratch/<slug>/review.yaml` paths in review and memory modules intentionally store review decisions for both trackers; `work-item-files.ts` paths are local worktree discovery warnings. GitHub workflow send-back uses the identity-bound path in its atomic review commit.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested combined Vitest run finished with 98 passed and 11 failed: all 47 GitHub stint, 14 local Ship, 9 GitHub route, and 1 GitHub flow tests passed. In the local stint suite, 3 socket tests failed; an isolated socket retry confirmed `listen EPERM` for 127.0.0.1. Eight adapter-launch cases also failed: the non-failure variants timed out waiting for a finished stint, and the injected-session-write-failure variants returned 201 instead of 503. One of the latter was reproduced with the same assertion against an untouched HEAD export. The complete combined command has not passed; the fake-gh/local-route test criterion remains unchecked.

**Codex, 2026-11-01:** Updated the local GitHub gate assertion and added its reason code. Ship now accepts the structured main/worktree workflow divergence warning while continuing to refuse invalid workflow records. Ticket-bound GitHub recovery waits for complete item detail before adoption and retries after detail or discovery refresh, including rate-limit cooldown. Added route regressions for divergent and invalid workflow records and for recovery with available and initially failing detail.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), and `pnpm typecheck` passed. In the requested combined Vitest run, `github-item-routes.test.ts` passed 13 tests and `github-tickets.test.ts` passed 2 tests; the remaining three files did not report results after several minutes, so the run was interrupted. A separate `ship.test.ts` run also did not report results and was interrupted. No socket failure was reported during these runs. The full requested test command has not passed; the ticket remains open.

**Codex, 2026-11-01:** Ship send-back now validates GitHub identity and retains the existing write safeguards without requiring current approvals or fresh approval evidence. Approval-dependent Ship actions still recheck remote evidence. Ticket-bound recovery retries transient detail failures with bounded backoff, also responds to later refreshes, clears retry timers on stop, and does not retry identity failures. Regression coverage verifies changed issue content invalidates the recorded approval while conflict send-back reopens Implement, and verifies automatic offline recovery and timer cleanup.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested combined Vitest command passed 54 tests, including all 15 GitHub item route and 14 Ship tests; 4 GitHub lifecycle WebSocket tests failed because the sandbox denied `listen 127.0.0.1` with `EPERM`. The ticket remains open pending those socket tests in an environment that permits listening.

**Codex, 2026-11-01:** Recovery retries now require a pending ticket-bound recovery, preserve the rate-limit-only cooldown, and retry discovery with bounded backoff when startup is offline and the item is not cached. Ship rechecks GitHub identity, freshness, and current approvals after acquiring the repository lock, including local merges. Added controlled lock-wait and startup-offline recovery regressions.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested combined Vitest run passed 73 tests, including the unchanged detail and ticket regressions and all Ship and GitHub item route tests. Four GitHub lifecycle WebSocket tests failed because the sandbox rejected `listen 127.0.0.1` with `EPERM`; they require a socket-enabled environment. No commit was made.

**Codex, 2026-11-01:** Restored queued post-stint GitHub detail refreshes, including cooldown retries, and retained refreshes queued during another detail read. Incomplete recovery detail now schedules bounded retries and later successful detail or discovery refreshes can recover the stint. Added an incomplete-then-complete recovery regression.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested seven-file Vitest run passed 108 tests; four lifecycle WebSocket tests failed because the sandbox denied `listen 127.0.0.1` with `EPERM`. No commit was made.

**Codex, 2026-11-01:** Deferred ticket-bound GitHub recovery now reserves the work item and ownership immediately, exposes a recovery warning while waiting, and releases the reservation through Stop. Identity errors retain the pending recovery and warning until a later verified detail/discovery refresh or Stop. Regression coverage checks conflicting starts, stage-agent and Ship writes, Stop, transient/incomplete detail, and identity recovery.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The new Stop and identity route regressions passed. The requested five-file Vitest run was interrupted after several minutes without a final result. A separate local recovery run failed the TCP case with `listen EPERM`; a direct localhost listen reproduced that sandbox restriction. Non-socket saved-handoff recovery also timed out with status `running`; the same focused test failed identically on an untouched HEAD export. The full requested test command has not passed. No commit was made.

**Codex, 2026-11-01:** Fixed repository identity replacement handling. A repository ID mismatch during discovery, detail refresh or write identity verification clears the cached discovery and blocks identity-bound writes until a fresh discovery succeeds. Pending recovery candidates remain reserved and visible. Added a two-item regression covering redaction, write refusal and rediscovery; existing ticket and recovery identity behavior remains covered.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), `pnpm typecheck`, `pnpm vitest run packages/server/src/github-item-routes.test.ts` (20 passed), `pnpm vitest run packages/server/src/github-lifecycle.test.ts` (25 passed; 4 socket tests failed with sandbox `listen EPERM` on 127.0.0.1), `pnpm vitest run packages/server/src/github-stints.test.ts` (47 passed), and `pnpm vitest run packages/server/src/github-tickets.test.ts` (2 passed, including the unchanged repository-ID regression).

**Codex, 2026-11-01:** Reserved interrupted stints before GitHub discovery, kept ordinary API requests waiting for full initialization, and allowed Stop to proceed after local recovery. Retained cleanup-only ship retry and detail-free finalization for stopped or finalizing stints. Added coverage for hanging discovery, persisted Stop, and ship cleanup retry. Changed the ticket-bound detail-wait fixture from finalization to findings because finalizing stints correctly finish without GitHub detail; the separate hanging-discovery test still covers finalization. After detail arrives the incomplete fixture falls back for missing recovery metadata, and asynchronous retry, Stop release, and identity refresh remain explicitly checked.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), and `pnpm typecheck` passed. Separate Vitest runs passed: `github-item-routes.test.ts` (24), `github-stints.test.ts` (47), `github-tickets.test.ts` (2), and `ship.test.ts` (14). An earlier `github-lifecycle.test.ts` run passed 25; four socket tests failed with sandbox `listen EPERM`. No commit made.

**Codex, 2026-11-01:** Fixed ticket-bound recovery to continue discovery from its existing cursor when the item is not yet discovered, while retaining the normal first-page refresh behavior. A missing item remains reserved with the recovery warning after discovery completes; Stop releases it. Automatic discovery retries also stop on an identity failure. Added regression cases for an item in the next discovery batch and an item absent from all pages; the fixture crosses the existing five-page batch limit.

Checks passed: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 warnings), `pnpm typecheck`, and separate Vitest runs for `github-item-routes` (26), `github-stints` (47), `github-tickets` (2), `github-discovery` (64), and `ship` (14). No socket failures occurred in these runs. Existing test changes are additions only.

**Codex, 2026-11-01:** Rebuilt GitHub route snapshots from current project and worktree files over cached GitHub discovery and detail, including fresh identity binding and GitHub gate projection. Ship's existing repository-lock revalidation now uses this projection. Added a frozen-cache regression for a committed stage reopening and a stage-agent refusal for a newly invalid workflow; existing test changes are additions only.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 warnings), and `pnpm typecheck` passed. Separate Vitest runs passed for `github-item-routes` (27), `github-stints` (47), `github-tickets` (2), `github-gates` (49), `ship` (14), and `github-snapshot` (7). `github-lifecycle` passed 25 tests; four failed because the sandbox rejected `listen 127.0.0.1` with `EPERM`: `new offline WebSocket connection redacts data after account changes`, `new offline WebSocket connection redacts data after origin changes`, `viewer polling is client-scoped, preserves data on failure, and stops with the server`, and `viewer polling respects discovery rate limit until its retry deadline`. No commit was made.
