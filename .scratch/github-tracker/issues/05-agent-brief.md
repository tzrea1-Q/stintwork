# 05 — Start an issue ticket stint

Status: ready-for-agent
Blocked by: 04

## What to build

Connect the selected GitHub ticket to the existing stint and brief flow using the explicit issue references and worktree instructions in the spec. Refresh first, refuse stale or unknown dependencies, and keep issue writes with the agent and its skills.

## Acceptance criteria

- [x] The brief gives repo, issue identities, URLs, read commands, worktree, scope, handoff and checkpoint without credentials or local ticket instructions.
- [x] Planning and ticket prompts direct issue updates to the configured skill and `gh`; no issue content is mirrored or written by Stintwork.
- [x] A fresh complete snapshot is required to start a ticket; resolved, blocked, unknown and changed identities refuse safely. Starting a stint or creating a worktree or branch for a GitHub item validates its identity record first and refuses on mismatch; it uses the shared current-approval check from ticket 04.
- [ ] Fake-gh tests verify scope, refresh/failure and unchanged local Markdown briefs and stints without network.

## Comments

**Codex, 2026-10-28:** Preserved supplied `.scratch/` paths verbatim in GitHub briefs and refreshed GitHub detail asynchronously after stint finalization, using the existing detail failure path. Added brief and fake-gh coverage for preserved paths, updated and failed detail reads, and local stints. `pnpm format`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed. The requested four-file Vitest run had 97 passes and 11 failures: three socket tests hit `listen EPERM`, while eight agent-session cases failed (four timed out and four returned 201 instead of 503). Both failure modes also reproduced in the Claude installed cases on an untouched HEAD archive. No commit or push.

**Codex, 2026-10-28:** Scoped GitHub ticket completion and commit instructions to implementation stages, preserved read-only review guidance, and added the secrets and project-check instructions for parity with local briefs. Added coverage for a selected-ticket review and implement and Clarify instructions. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/core/src/brief.test.ts packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts` (57 passed). No commit or push.

**Codex, 2026-10-28:** Scoped GitHub preview and start freshness to the selected item's discovery and freshly read detail, while retaining identity and upstream-reopening checks. Added coverage for unscanned pages, another item's failed detail, incomplete discovery, and identity failures. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/server/src/github-gates.test.ts` (75 passed). No commit or push.

**Codex, 2026-10-28:** Refused GitHub preview and start when discovery is incomplete, stale or errored, and enforced projected prior approval state so upstream reopenings invalidate downstream approvals. Added fake-gh coverage for incomplete discovery, stale/error snapshots, Clarify and Spec reopenings, and current approval start. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/server/src/github-snapshot.test.ts packages/server/src/github-gates.test.ts` (80 passed). No commit or push.

**Codex, 2026-10-28:** Scoped the stint-start workflow write guard to GitHub work items, restoring local gate and start ordering. GitHub briefs now target the selected ticket, give review range and reviewed-commit instructions, and publish only the output owned by the gate; Clarify and Diagnose settle questions without publishing. Added brief tests for these cases. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the requested six-file Vitest command: 102 passed and 11 failed. The three reported local regressions passed, as did all GitHub stint, brief preview, and brief tests. Three `stints.test.ts` socket tests failed with `listen EPERM`; eight agent-session cases failed (four timed out waiting for finished and four returned 201 instead of 503), matching the prior recorded environment failures. Also ran the two local regression suites separately: 25 passed. No commit or push.

**Codex, 2026-10-28:** Connected GitHub detail refresh, identity and prior approval checks to preview and stint start; first start commits the identity-bound workflow in the worktree and shares the gate write guard. Added fake-gh coverage for preview, start, refusal, approval freshness and concurrency. Ran `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/core/src/brief.test.ts` (49 passed). The unchanged `stints.test.ts` suite had 27 passes and 11 failures: three socket tests hit `listen EPERM`, and eight agent-session cases failed; representative cases of both agent-session failure modes also fail on an untouched HEAD archive in this environment. A full passing local stint suite and the real GitHub exit remain unverified. No commit or push.

**Codex, 2026-10-28:** Added a GitHub-specific brief compiler branch and focused prompt tests; existing local brief assertions remain unchanged. Ran `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/core/src/brief.test.ts`. Server integration, first-write and concurrency protection, and the requested server tests remain unfinished; no acceptance criteria are checked.

Coordinator browser check, 2026-10-28: the drawer offers an enabled Start stint for GitHub items; the start path (`prepareStintBrief`) indexes without GitHub discovery, so it refuses as not found. Ticket 05 must make this start work, or disable it with a reason until it does.

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-28:** Refused GitHub preview and start when the most recent discovery refresh failed, independently of other items' detail freshness. Added fake-gh coverage for failure after successful discovery, no worktree or record on refusal, and start after recovery; unrelated detail failure and unscanned pages still pass. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` successfully. The requested four-file Vitest run had 96 passes and 9 failures: all nine failures were socket tests in `index.test.ts` blocked by `listen EPERM` in the sandbox. No commit or push.

**Codex, 2026-10-28:** Made GitHub review briefs read-only for issues and included the existing or expected worktree path in GitHub briefs using the shared worktree calculation. Added core and server coverage, including preview without creating a worktree. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/core/src/brief.test.ts packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts` successfully (59 tests passed). No commit or push.

**Codex, 2026-10-28:** Applied ticket readiness refusals only to implementation stages for GitHub briefs, allowing resolved tickets at review while retaining identity, freshness, discovery and approval checks. Added resolved-ticket preview coverage for review and implement. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/core/src/brief.test.ts` (61 passed). No commit or push.

**Codex, 2026-10-28:** Shared ticket and blocker identity validation and registration between detail refresh and GitHub brief preparation. Preview and start now refuse changed node IDs with the identity reason and invalidate the affected detail. Added fake-gh coverage for both entry points, ticket and blocker changes, and unchanged identities. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/github-detail-identity.test.ts packages/server/src/github-detail-refresh.test.ts packages/server/src/brief-preview.test.ts` (54 passed). No commit or push.

**Codex, 2026-10-28:** Enforced GitHub ticket blockers in every stage while keeping resolved tickets reviewable when blockers are closed. Added review preview and start coverage for unknown dependencies, open blockers, and a resolved ticket with a closed blocker. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/core/src/brief.test.ts` (74 passed). No commit or push.

**Codex, 2026-10-28:** Made GitHub preview and start decisions use their own detail read, and ordered detail publication per item across brief preparation and the detail refresh route. Added controlled overlapping-read tests in both orders. `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the requested four-file Vitest run passed (63 tests). No commit or push.
