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

**Codex, 2026-10-28:** Scoped GitHub preview and start freshness to the selected item's discovery and freshly read detail, while retaining identity and upstream-reopening checks. Added coverage for unscanned pages, another item's failed detail, incomplete discovery, and identity failures. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/server/src/github-gates.test.ts` (75 passed). No commit or push.

**Codex, 2026-10-28:** Refused GitHub preview and start when discovery is incomplete, stale or errored, and enforced projected prior approval state so upstream reopenings invalidate downstream approvals. Added fake-gh coverage for incomplete discovery, stale/error snapshots, Clarify and Spec reopenings, and current approval start. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/server/src/github-snapshot.test.ts packages/server/src/github-gates.test.ts` (80 passed). No commit or push.

**Codex, 2026-10-28:** Scoped the stint-start workflow write guard to GitHub work items, restoring local gate and start ordering. GitHub briefs now target the selected ticket, give review range and reviewed-commit instructions, and publish only the output owned by the gate; Clarify and Diagnose settle questions without publishing. Added brief tests for these cases. Ran `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the requested six-file Vitest command: 102 passed and 11 failed. The three reported local regressions passed, as did all GitHub stint, brief preview, and brief tests. Three `stints.test.ts` socket tests failed with `listen EPERM`; eight agent-session cases failed (four timed out waiting for finished and four returned 201 instead of 503), matching the prior recorded environment failures. Also ran the two local regression suites separately: 25 passed. No commit or push.

**Codex, 2026-10-28:** Connected GitHub detail refresh, identity and prior approval checks to preview and stint start; first start commits the identity-bound workflow in the worktree and shares the gate write guard. Added fake-gh coverage for preview, start, refusal, approval freshness and concurrency. Ran `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-stints.test.ts packages/server/src/brief-preview.test.ts packages/core/src/brief.test.ts` (49 passed). The unchanged `stints.test.ts` suite had 27 passes and 11 failures: three socket tests hit `listen EPERM`, and eight agent-session cases failed; representative cases of both agent-session failure modes also fail on an untouched HEAD archive in this environment. A full passing local stint suite and the real GitHub exit remain unverified. No commit or push.

**Codex, 2026-10-28:** Added a GitHub-specific brief compiler branch and focused prompt tests; existing local brief assertions remain unchanged. Ran `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm vitest run packages/core/src/brief.test.ts`. Server integration, first-write and concurrency protection, and the requested server tests remain unfinished; no acceptance criteria are checked.

Coordinator browser check, 2026-10-28: the drawer offers an enabled Start stint for GitHub items; the start path (`prepareStintBrief`) indexes without GitHub discovery, so it refuses as not found. Ticket 05 must make this start work, or disable it with a reason until it does.

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
