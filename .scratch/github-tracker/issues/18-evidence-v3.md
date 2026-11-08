# 18 — GitHub evidence version 3

Status: ready-for-agent
Blocked by: 16

## What to build

Adopt ADR 0016 so routine ticket progress comments do not invalidate new approvals, while preserving verification of historical evidence.

## Acceptance criteria

- [x] ADR and spec record the decision and compatibility.
- [x] New approvals use v3; v1 and v2 retain their own verification rules and unknown versions remain unknown.
- [x] Ticket comments and state changes do not invalidate v3, while ticket set, bodies, triage labels and blocker identities do.
- [x] A subsequent unblocked ticket can start after a completion comment and closure without reapproval.
- [x] Requested checks are run and recorded.

## Comments

**Codex, 2026-11-07:** Implemented v3 and retained version-specific verification, including v2 comment sensitivity and v1 behavior. The fake-gh flow confirms a completion comment remains visible and the next ticket starts after closure without reapproval; fresh checks also cover changed ticket bodies, sets, triage labels and blocker identities.

Updated assertions that expected v2 for newly recorded approvals in `creates and commits a current approval`, `handles unknown dependencies when operating on spec`, `handles unknown dependencies when operating on clarify`, `spec approval is current after a ticket edit (custom: false)`, `tickets approval is stale after a ticket edit (custom: false)`, `spec approval is stale after a ticket edit (custom: true)`, and `GitHub discovery, gates, ticket stints, freshness and recovery use read-only gh`. Updated the current review digest expectation in `projects workflow records and fresh, stale and unknown approval evidence`; review-digest fixtures now use v3, while historical verification remains version-specific.

Checks passed: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 warnings, 6 infos), `pnpm typecheck`, and separate `pnpm vitest run` invocations for `packages/core/src/github-evidence.test.ts` (7), `packages/server/src/github-gates.test.ts` (61), `packages/server/src/github-snapshot.test.ts` (7), `packages/server/src/github-stints.test.ts` (48), `packages/server/src/github-flow.test.ts` (1), and `packages/server/src/ship.test.ts` (14). No socket tests failed.
