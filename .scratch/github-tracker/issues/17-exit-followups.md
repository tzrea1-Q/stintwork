# 17 — Real-repository exit follow-ups

Status: ready-for-agent
Blocked by: 16

## What to build

Resolve the findings from the real-repository exit, including the issues deferred from tickets 14 and 16. Preserve GitHub identity and evidence safeguards while keeping the board and recovery usable.

## Acceptance criteria

- [x] Re-verify the GitHub account before its 60-second TTL expires so the board does not periodically blank to “Verifying GitHub account…”, hiding pending permissions and making UI refs stale.
- [x] Diagnose and fix stint starts that fail silently or with “This operation was aborted” during adapter preparation, including the suspected link to the 60-second account re-check; preparation failures are never lost silently. This occurred twice on ticket #2 under low machine load.
- [x] Starting another stint with the same pinned adapter does not repeatedly ask the developer to confirm its source.
- [ ] GitHub blockers display issue numbers in GitHub format, such as “#2” rather than “02”.
- [ ] Improve GitHub detail read latency for two tickets, observed at about 10–18 seconds.
- [x] Pending permission requests have a stronger signal so they do not go unnoticed, as one did for 25 minutes.
- [ ] A handoff-unresolved attention item leaves Needs you when the gate it asks about is approved.
- [ ] While a post-stint write is active, the gate does not misleadingly show “Ready to approve”; attempted gate changes surface the `gate.activeWrite` reason instead of only “Could not change the gate.”
- [ ] “Changed since the last handoff” reports committed memory proposals and gate approvals instead of saying none.
- [x] Startup does not serially block ordinary API requests on each pending recovery's GitHub detail fetch in `packages/server/src/index.ts`; several interrupted GitHub stints and slow GitHub must not delay ordinary requests by minutes. This was deferred from ticket 14.
- [ ] With dependency-only incomplete detail at a stage whose evidence includes tickets, Reopen remains available in `GateView` when the reopen route permits it, despite the projection suppressing `reviewDigest`. This was deferred from ticket 16.
- [x] The pull request checks panel does not hold the Ship write continuously. It polls `ship/pr-checks` every 60 seconds while one request took 60–90 seconds, so overlapping requests returned 409 `ship.activeWrite` and Merge could only proceed after the review overlay was closed.
- [x] Ship preview, PR checks refresh and merge preview each took about 60–100 seconds of serial GitHub reads with only “Working…”; reduce the latency and show progress. Approving the Review gate likewise gave no visible feedback for several seconds.
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

**Codex, 2026-11-08:** The start preview aborted its streaming request on unmount, and the server translated a request/stream disconnect into `stop_requested` even without a developer Stop. A redaction or other unmount could therefore trigger the observed stopped stint; the 60-second recheck is a possible trigger, not proven to be the cause of that particular event. Adapter preparation errors also occurred before a stint log existed. The start request now survives preview unmount, disconnected preparation is recorded as a failed stint with its reason, and pending permissions have persistent board/drawer and title signals. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Web touched tests passed (67); focused server preparation, explicit Stop, and disconnect tests passed (9). The full server run had three socket `listen EPERM` failures and eight previously observed sandbox launch/session failures; its outdated authentication expectation was subsequently updated and passed in isolation. The browser matrix could not start its server due to `listen EPERM`; the coordinator must rerun the full touched server file and browser cases outside the sandbox. Criteria remain unchecked.

**Codex, 2026-11-08:** Fixed batch B review findings: closing or unmounting the preview aborts a pending start, and preparation failure or cancellation is recorded under `.stintwork/local/preparation-failures` before worktree or workflow setup. Added coverage for dismissal, cancellation, failure records, no worktree and retry. Both reported Claude and Grok login tests pass. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The full requested test run passed 68 tests, including all 31 BriefPreview tests, and failed 13: five socket `listen EPERM` and eight previously observed sandbox launch/session failures. The coordinator should rerun the affected server files outside the sandbox. Criteria remain unchecked.

Staging the requested commit failed because the sandbox cannot create the worktree Git `index.lock` (`Operation not permitted`). The changes remain uncommitted on top of `ebff781`.

**Codex, 2026-11-08:** The disconnect guard treated an allocated agent handle as a completed start, so dismissal before readiness did not cancel it. Startup now remains cancellable until ready, stops the handle, and records the disconnect reason as a failed stint. Preparation failures previously went to an unread directory; they now appear in stint history with their reason, including before a worktree exists. The HTTP retry test was waiting for a stint log while the implementation wrote a different directory; it now observes the history record and still checks cancellation before download and retry. An unintended preview unmount still cancels a start, but the failure is visible in history. Criteria remain unchecked.

`pnpm format`, `format:check`, `lint`, `typecheck`, and `build` passed. BriefPreview and Stints web tests passed (37); the socket-free stint run passed 28 with 11 excluded. The full stint run could not verify the HTTP retry regression: its three socket cases fail at `listen EPERM`; eight previously observed sandbox launch/session cases also failed. Two other test expectations were corrected and passed in the subsequent focused and socket-free runs. The coordinator must rerun the full stint file outside the sandbox.

**Codex, 2026-11-08:** Fixed batch B review findings on top of `2349cb6`. Preparation failures remain in history with a distinct status and no longer replace gate or review evidence, handoffs, recovery selection, or pending developer notes. Start cancellation is checked around revalidation and worktree/workflow setup, including inside worktree creation. Shutdown is distinguished from a disconnected preview. Added gate and cancellation regressions. All four reported regressions pass in a focused run; the new tests and core evidence and web history/stream tests pass. The full touched-test run passed 90 tests and failed 13: five sandbox socket `listen EPERM` failures and eight previously observed sandbox launch/session failures; the coordinator should rerun outside the sandbox. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Criteria remain unchanged.

Staging for the requested commit was blocked because the sandbox cannot create the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `2349cb6`.

**Codex, 2026-11-08:** Fixed both batch B cancellation review findings on top of `6c4c305`: cancellation before setup records a preparation failure without creating a worktree; after setup starts, worktree creation, agent inheritance and the guarded workflow commit run to completion before cancellation is recorded. Restored the existing guarded inheritance commit on brief failure. Added regressions for cancellation during worktree creation, after creation, during brief revalidation, and alongside a brief failure; each verifies a clean committed workflow and a successful retry with inherited agents. Criteria remain unchanged.

`pnpm format`, `format:check`, `lint`, `typecheck`, and `build` passed. The focused cancellation tests passed (5); Git worktree tests and stage-stint recovery tests passed (33). The full requested run passed 65 tests and failed 11: three socket `listen EPERM` failures and eight previously observed sandbox launch/session failures. The coordinator must rerun the full stint file outside the sandbox.

Staging for the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `6c4c305`.

**Codex, 2026-11-08:** Fixed the batch B pre-ready cancellation finding: unsuccessful starts before the first work turn are recorded as `preparation-failed`, preserving earlier gate evidence and pending developer notes. Updated the HTTP disconnect test and other pre-ready expectations to the existing preparation-failure status; the HTTP test still requires cancellation before download and a successful retry. Added a finished-stint/pre-ready-disconnect regression for gate readiness and notes. `pnpm format`, `format:check`, `lint`, `typecheck`, and `build` passed; five focused disconnect, notes and Stop tests passed. The required unfiltered stint suite passed 32 tests and failed 11: three socket cases cannot bind (`listen EPERM`) and eight launch/session cases show the previously observed sandbox failures. The HTTP regression and full suite need a socket-enabled rerun outside the sandbox. Criteria remain unchanged.

**Codex, 2026-11-08:** Fixed the preparation-failure follow-up on `cab7873`: pre-ready failures no longer checkpoint or inspect checkpoint warnings, retry reinstalls partially prepared dependencies, and HTTP/live snapshots accept the status. The seven reported Codex, Grok and Claude regressions pass; their pre-ready status expectations now use `preparation-failed`, and the Claude and Stop checkpoint expectations were removed or changed to null because no checkpoint is created. Added checks that Stop leaves unrelated work uncommitted and retry reinstalls, and that snapshots accept preparation failures. `pnpm format`, `format:check`, `lint`, `typecheck`, and `build` passed. The requested test selection passed 165 and failed 13: five socket `listen EPERM` and eight previously observed sandbox launch/session failures. The coordinator should rerun the affected server tests outside the sandbox. Criteria remain unchanged.

**Codex, 2026-11-08:** Fixed the batch B focus finding on `d1b1eb1`: selecting the already-open work item in Needs you returns focus to the drawer's permission banner. Added a web regression test; the NeedsYouQueue test file passed (39 tests). `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Criteria remain unchanged.

Staging for the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). The changes remain uncommitted on `d1b1eb1`.

**Codex, 2026-11-08:** Fixed the batch B review finding on `fc76563`: errors after start ownership and before the stint log is created now leave a `preparation-failed` history entry with their reason, whether or not the request was aborted. Existing early refusals and login handling are preserved. Added worktree-creation and GitHub-revalidation history regressions. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The requested stint and GitHub stint files passed 82 tests and failed 11: three socket `listen EPERM` failures and eight previously observed sandbox launch/session failures. All 49 GitHub stint tests and both new regressions passed. The coordinator should rerun the full stint file outside the sandbox. Criteria remain unchanged.

Staging for the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on `fc76563`.

**Codex, 2026-11-08:** Fixed the batch B retry regression on `f708061`: preparation-failure history records whether dependency setup began, and only those preparation failures force dependency reinstallation on retry. Added coverage for an adapter preparation failure preserving an existing npm installation and for cancellation during dependency setup forcing a retry install. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Both focused regressions passed. The requested full stint and worktree-readiness run passed 46 tests and failed 11: three socket `listen EPERM` failures and eight previously observed sandbox launch/session failures; all 12 worktree-readiness tests passed. The coordinator should rerun the stint file outside the sandbox. Criteria remain unchanged.

Staging for the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). The changes remain uncommitted on `f708061`.

**Codex, 2026-11-08:** Fixed the retry history review finding on top of `7aaefcc`: pre-dependency preparation failures no longer hide an earlier failed dependency installation. Added a regression covering installation failure, adapter preparation failure, and successful reinstallation on the next start; it failed before the fix and passes afterward. `pnpm format`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed. The requested stint and worktree-readiness run passed 47 tests and failed 11: three socket `listen EPERM` failures and eight previously observed sandbox launch/session failures. All 12 worktree-readiness tests passed. The coordinator should rerun the stint file outside the sandbox. Criteria remain unchanged.

Staging the requested commit failed because the sandbox could not create the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on `7aaefcc`.

**Codex, 2026-11-08:** Ship PR checks now refresh without taking the exclusive Ship write, polls wait for completion and pause during Ship actions and confirmations, and merge retains its current-head Review and CI rechecks. GitHub evidence is read once per action with bounded concurrent connections; parent comments and sub-issues are fetched concurrently. Added English and Chinese Ship/CI progress and gate approval pending labels, with regression coverage for overlapping reads, write contention and polling. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The Ship, GitHub gates, GitHub tickets, GitHub item routes, PullRequests, GateView and ShipActions Vitest files passed. GitHub tickets initially failed because its capped-pagination fake did not provide the newly concurrent comments request; after completing that fake, the file passed. Criteria remain unchecked.

The requested commit could not be staged: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). The changes remain uncommitted.

**Codex, 2026-11-08:** Fixed the batch D review race by ordering per-PR CI evidence writes while allowing reads to overlap; an older refresh cannot overwrite a newer successful refresh. Kept the gate approval button's accessible name stable while showing its pending state, with regression tests for both changes. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; Ship, pull-request, and GateView Vitest files passed (112 tests). Playwright requires the coordinator's outside-sandbox rerun, including the gate layout screenshots. Criteria remain unchecked.

The requested commit could not be staged: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `006e0c3`.

**Codex, 2026-11-08:** Fixed the batch D review finding: superseded CI refreshes return the newest persisted evidence, and the panel ignores older response and item snapshots. Evidence timestamps advance monotonically even when the clock does not. Added server and web regression tests. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; pull-requests, Ship and PullRequests Vitest suites passed (78 tests), and the final concurrency and timestamp tests passed separately. Criteria remain unchecked.

The requested commit remains uncommitted: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`).

**Codex, 2026-11-08:** Fixed the batch D CI safety race: merge and merge preview decide using their own fresh CI fetch, while newer-started successful refreshes remain authoritative on disk and for polling. Regression tests cover a later passing poll overlapping a failing merge or merge preview. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed; pull-requests and Ship Vitest files passed (66 tests). No web files were changed. Criteria remain unchecked.

The requested commit could not be staged because the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `e7432a8`.

**Codex, 2026-11-08:** Fixed the PR CI panel's identity-change race: in-flight refreshes are aborted when the recorded PR number, URL or head changes, and responses must match the current PR number and head. Web regression tests cover each identity change and mismatched responses. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm vitest run packages/web/src/PullRequests.test.tsx` passed (20 tests). Criteria remain unchecked.

The requested commit could not be staged because the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `36c0b31`.

**Codex, 2026-11-08:** Fixed the CI evidence ordering review finding: publication follows the order in which `gh pr checks` returns, including when an earlier request is delayed before the checks call. Merge and merge preview still decide using their own fresh fetch. Added regression coverage for both delayed observation and delayed publication. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the pull-requests and Ship Vitest files passed (67 tests). No web files were changed. Criteria remain unchecked.

The requested commit could not be staged because the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `f001bf7`.

**Codex, 2026-11-08:** Fixed the PR CI panel to display checks for a newer remote head of the current PR, including the stale-evidence warning, while retaining protection against superseded requests and other PRs. Web regression tests cover both cases. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm vitest run packages/web/src/PullRequests.test.tsx` passed (20 tests). Criteria remain unchecked.

The requested commit could not be staged because the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `35c6e3b`.

**Codex, 2026-11-08:** Fixed the batch D review finding by ordering PR check observations across head changes for the same work item and PR number/URL; a different PR resets the evidence. In-flight requests still abort on a recorded head change. Web regression coverage checks older refresh responses and item snapshots, absent evidence, and a different PR. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm vitest run packages/web/src/PullRequests.test.tsx` passed (21 tests). The coordinator's outside-sandbox browser verification remains outstanding for this change. Criteria remain unchanged.

The requested commit could not be staged: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on top of `6f988fb`.

**Coordinator, 2026-11-08:** Batch D verified at `1e0f401`, outside the sandbox. format:check, lint, typecheck, build, test (3,255 passed), smoke:package and test:e2e (432 passed) all exit 0. Seven `codex review` rounds fixed these findings:
- a gate button whose accessible name changed while pending;
- overwrites by older CI evidence;
- superseded responses shown in the panel;
- merge deciding on another request's CI result;
- request-order versus observation-order publication;
- PR-identity and head-change handling.

The final review is clean. Two criteria are ticked.

**Coordinator, 2026-11-08:** Batch B verified at `9061849`, outside the sandbox. format:check, lint, typecheck, build, test (3,255 passed), smoke:package and test:e2e (432 passed) all exit 0; the final `codex review` is clean.

Root cause of the auto-stopped stint: an unmounted start preview aborted its request, and the server treated the disconnect as a developer Stop.

Ten review rounds settled the design:
- Pre-launch failures and cancellations are recorded as `preparation-failed`. They are visible in stint history but are never gate or review evidence, and they create no checkpoint.
- Setup is atomic once worktree creation begins.
- Dependencies are reinstalled only after a failure during installation.
- Login hints and attention items are unchanged.

Remaining limitation: an unintended preview unmount still fails a start, but visibly. Two criteria are ticked.

**Codex, 2026-11-08:** Batch C resolves gate-only pending handoffs after a later approval and supersedes earlier handoffs after a later finished stint with its own handoff. Gate readiness now exposes active writes and coded refusals, committed workflow and review decisions appear in changed paths, and dependency-only incomplete GitHub detail supplies separate evidence for reopening without enabling approval. Added focused regressions; the existing gate-write serialization test now also checks the busy snapshot and coded refusal. No existing expected behavior was changed. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The seven touched Vitest files passed (198 tests); the Git checkpoint file was rerun after adding the GitHub workflow-path regression and passed all 6 tests. The coordinator should run Playwright and browser review outside the sandbox. Criteria remain unchecked.

The requested commit could not be staged: the sandbox denied creation of the worktree Git `index.lock` (`Operation not permitted`). Changes remain uncommitted on `codex/m11-17c`.
