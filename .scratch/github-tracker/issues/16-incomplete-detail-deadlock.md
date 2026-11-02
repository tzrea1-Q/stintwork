# 16 — Incomplete GitHub detail deadlock

Status: resolved
Blocked by: 15

## What to build

Allow stage-level stints to repair unknown GitHub ticket dependencies without treating a successful incomplete read as a failed or stale read. Keep dependency-dependent actions fail-closed and explain unknowns in the gate. Tell GitHub ticket authors the accepted blocker format.

## Acceptance criteria

- [x] Successful reads with only unknown text blockers remain fresh; genuine read failures remain failed and stale.
- [x] Stage-level stints can start; unknown ticket blockers and dependency-dependent gates still refuse with useful warnings.
- [x] GitHub Tickets briefs describe parseable blocker text and local briefs remain unchanged.
- [x] Fake-gh and drawer regressions and requested checks cover the behavior.

## Comments

**Codex, 2026-11-01:** Brief reads now retain successful dependency-unknown detail as fresh while ticket stints and dependency-dependent approvals remain blocked. Spec-only evidence can still validate a prior approval, allowing a Tickets stage stint to repair the text. The Tickets gate exposes the detail warnings; the GitHub brief documents the accepted format. Genuine read failures still mark detail failed and stale. Ticket 14 recovery continues to wait for complete detail.

Changed the existing `unknown dependencies refuse review preview and start` assertion from the generic unavailable-evidence message to the specific text-blocker warning; it still verifies both refusals. Added fake-gh refresh, stage-start and gate coverage, plus brief and drawer tests.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 existing warnings), `pnpm typecheck`, and separate Vitest runs for `github-item-routes.test.ts` (27), `github-stints.test.ts` (48), `github-gates.test.ts` (50), `github-tickets.test.ts` (2), `brief.test.ts` (26), and `Board.test.tsx` (48) passed. No socket failures occurred. No commit made.

**Codex, 2026-11-01:** Gate writes now accept dependency-only incomplete detail for approvals whose evidence excludes tickets and for reopening earlier gates. Dependency-dependent approvals still refuse with the detail warnings. A failed post-write read remains a failed read even after a dependency-only incomplete read. Added fake-gh coverage for Spec approval, reopening Clarify and Spec, Tickets refusal, and post-write failure.

Checks passed: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 existing warnings), `pnpm typecheck`, and separate Vitest runs for `github-gates.test.ts` (55), `github-stints.test.ts` (48), `github-tickets.test.ts` (2), `github-item-routes.test.ts` (27), and `github-flow.test.ts` (1). No socket failures occurred. No commit made.

**Codex, 2026-11-01:** Projected dependency-only incompleteness separately from failed, stale, and discovery-incomplete detail. Shared core gate readiness now permits gates whose evidence excludes tickets and gives the detail warnings for ticket-dependent gates. The evidence-scope rule is shared with the server. Added core readiness regressions and a fake-gh server test covering detail refresh, Spec approval, and Tickets refusal. No existing tests were changed to encode the former behavior.

Checks passed: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 existing warnings), `pnpm typecheck`, and separate Vitest runs for `gates.test.ts` (27), `github-gates.test.ts` (56), `github-stints.test.ts` (48), `github-tickets.test.ts` (2), `github-item-routes.test.ts` (27), `github-flow.test.ts` (1), and `Board.test.tsx` (48). No socket failures occurred. No commit made.

**Coordinator, 2026-11-01:** Resolved. Merged to main as `a4fe448`.

Verify on the coordinator machine at `0fd4d90`: format:check, lint, typecheck, build, test (3,230/3,230), smoke:package and test:e2e (432) passed. An earlier run at `5c7fed1` had one e2e failure at load average 24 (`Needs you shows a stale local approval with a reopen action`, 1440px zh-CN light); all 14 variants passed when rerun alone. The branch took three Codex review rounds.

The final review raised one P2, deferred to the exit follow-up ticket: with dependency-only incomplete detail at a stage whose evidence includes tickets, the projection suppresses `reviewDigest`, so the UI disables every Reopen button although the reopen route permits it. Rerunning the Tickets stint, the primary recovery path, works.

CI run 41379745335 passed: checks, both browser shards, and package-smoke on ubuntu and macOS.

Real-repository exit: with the merged build, the Tickets gate showed "Issue #2: text blockers unknown. Issue #3: native and text blockers disagree.", Start stint was enabled, and the brief carried the blocker-format instruction. A rerun Tickets stint corrected only the two `## Blocked by` sections, and the Tickets gate was approved as `aef02b1`.
