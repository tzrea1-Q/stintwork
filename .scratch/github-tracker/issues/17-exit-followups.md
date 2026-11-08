# 17 — Real-repository exit follow-ups

Status: ready-for-agent
Blocked by: 16

## What to build

Resolve the findings from the real-repository exit, including the issues deferred from tickets 14 and 16. Preserve GitHub identity and evidence safeguards while keeping the board and recovery usable.

## Acceptance criteria

- [x] Re-verify the GitHub account before its 60-second TTL expires so the board does not periodically blank to “Verifying GitHub account…”, hiding pending permissions and making UI refs stale.
- [ ] Diagnose and fix stint starts that fail silently or with “This operation was aborted” during adapter preparation, including the suspected link to the 60-second account re-check; preparation failures are never lost silently. This occurred twice on ticket #2 under low machine load.
- [x] Starting another stint with the same pinned adapter does not repeatedly ask the developer to confirm its source.
- [ ] GitHub blockers display issue numbers in GitHub format, such as “#2” rather than “02”.
- [ ] Improve GitHub detail read latency for two tickets, observed at about 10–18 seconds.
- [ ] Pending permission requests have a stronger signal so they do not go unnoticed, as one did for 25 minutes.
- [ ] A handoff-unresolved attention item leaves Needs you when the gate it asks about is approved.
- [ ] While a post-stint write is active, the gate does not misleadingly show “Ready to approve”; attempted gate changes surface the `gate.activeWrite` reason instead of only “Could not change the gate.”
- [ ] “Changed since the last handoff” reports committed memory proposals and gate approvals instead of saying none.
- [x] Startup does not serially block ordinary API requests on each pending recovery's GitHub detail fetch in `packages/server/src/index.ts`; several interrupted GitHub stints and slow GitHub must not delay ordinary requests by minutes. This was deferred from ticket 14.
- [ ] With dependency-only incomplete detail at a stage whose evidence includes tickets, Reopen remains available in `GateView` when the reopen route permits it, despite the projection suppressing `reviewDigest`. This was deferred from ticket 16.
- [ ] The pull request checks panel does not hold the Ship write continuously. It polls `ship/pr-checks` every 60 seconds while one request took 60–90 seconds, so overlapping requests returned 409 `ship.activeWrite` and Merge could only proceed after the review overlay was closed.
- [ ] Ship preview, PR checks refresh and merge preview each took about 60–100 seconds of serial GitHub reads with only “Working…”; reduce the latency and show progress. Approving the Review gate likewise gave no visible feedback for several seconds.
- [ ] A manual Refresh that gets 409 “Discovery busy” tells the developer instead of doing nothing visible.
- [x] GitHub identity is checked once per TTL, not per request: in 161 seconds of startup, detail and refresh, 24 of 48 `gh` calls were `auth status` or `api user`. Each call took 1.1–1.7 seconds.
- [ ] While a detail read is refreshing, the board does not flash “Results are incomplete” or “1 items have incomplete membership”, and that copy pluralises correctly.
- [ ] A shipped GitHub item's drawer does not show “No spec yet” and “No tickets yet” before its detail loads.
- [ ] Decide and document whether shipping a GitHub work item closes or links its parent issue. In the exit, parent #1 stayed open after PR #4 merged because the PR body had no closing keyword.

## Comments

**Codex, 2026-11-07:** Collected the real-repository exit findings and the follow-ups deferred from tickets 14 and 16. This ticket does not block ticket 08.

**Codex, 2026-11-07:** Implemented shared TTL-bound GitHub viewer verification, retained the verified board during a recheck, reused confirmed adapter sources by pin, and queued recovery detail reads with a concurrency limit. Added focused coverage. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; the GitHub item routes test file passed. The lifecycle and stint test files encountered socket `listen EPERM` failures. The stint file also had eight launch/session failures; one was reproduced with the original `stints.ts`. The criteria remain unchecked pending successful required checks.

**Codex, 2026-11-08:** The coordinator confirmed the stint and GitHub item route tests pass outside the sandbox and reported four real lifecycle failures. New sockets now wait for expired identity checks and cannot receive broadcasts before their offline identity check; polling resumes after a rate-limit deadline. The polling test's redacted first message remains appropriate because its recheck fails and the current identity cannot be verified; existing clients retain verified data during an ordinary recheck. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the GitHub item routes tests (28) passed. The lifecycle run passed 26 tests; its four socket tests still require a coordinator rerun because sandbox binding fails with `listen EPERM`. Criteria remain unchecked pending that verification.

**Codex, 2026-11-08:** Fixed the review findings: background viewer checks start before expiry, share concurrent checks, and renew the timestamp only after a real successful identity check; expired snapshots are redacted while verification is pending. Explicit refreshes and writes retain identity verification, and offline account changes invalidate previously verified data. The five reported identity failures pass unchanged. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The full GitHub detail refresh, discovery, gates, tickets, and item routes files passed; lifecycle passed 26 of 30, with four socket `listen EPERM` failures. Stints passed 28 of 39, with three socket failures and the same eight launch/session failures previously reproduced in this sandbox. The coordinator should rerun these files outside the sandbox; criteria remain unchecked pending verification.

The commit attempt was blocked because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `ade3c09`.

**Codex, 2026-11-08:** Fixed the two batch A review findings on top of `3b04086`: detail reads reuse a fresh real viewer verification, and discovery preserves the actual verification time when switching accounts. Explicit discovery and write identity checks remain in place. Added sequential-detail call-count and account-switch response/project regression coverage; updated the obsolete per-detail call-count expectation. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The five requested GitHub test files passed (166 tests). Lifecycle passed 26 tests; its four WebSocket tests failed with sandbox `listen EPERM` and need the coordinator's outside-sandbox rerun. Ticket criteria remain unchecked.

Staging for the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`); these changes remain uncommitted on top of `3b04086`.

**Codex, 2026-11-08:** Source confirmation now keys stable executable fields rather than probe timing; added installed-source regression coverage.

**Coordinator, 2026-11-08:** Batch A verified at `c4ce545`, outside the sandbox. format:check, lint, typecheck, build, test (3,240 passed), smoke:package and test:e2e (432 passed) all exit 0. Four `codex review` rounds raised:
- P1: a cache hit refreshed the TTL.
- P1: expired data was served while a check was pending.
- P2: sequential detail reads re-checked identity.
- P2: the new account stayed redacted after an account change.
- P2: the adapter key included `elapsedMs`.

All five are fixed, and the final review is clean. Four criteria are ticked; the rest remain open.

**Codex, 2026-11-08:** Ship PR checks now refresh without taking the exclusive Ship write, polls wait for completion and pause during Ship actions and confirmations, and merge retains its current-head Review and CI rechecks. GitHub evidence is read once per action with bounded concurrent connections; parent comments and sub-issues are fetched concurrently. Added English and Chinese Ship/CI progress and gate approval pending labels, with regression coverage for overlapping reads, write contention and polling. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The Ship, GitHub gates, GitHub tickets, GitHub item routes, PullRequests, GateView and ShipActions Vitest files passed. GitHub tickets initially failed because its capped-pagination fake did not provide the newly concurrent comments request; after completing that fake, the file passed. Criteria remain unchecked.

The requested commit could not be staged: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). The changes remain uncommitted.
