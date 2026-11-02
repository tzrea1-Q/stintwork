# 16 — Incomplete GitHub detail deadlock

Status: ready-for-agent
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
