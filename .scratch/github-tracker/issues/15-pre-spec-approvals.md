# 15 — Pre-spec approvals ignore parent body edits

Status: ready-for-agent
Blocked by: 14

## What to build

Apply ADR 0015 to GitHub approval projection and fresh approval checks, preserving identity, reopening, head and later-stage evidence rules.

## Acceptance criteria

- [x] ADR and spec record the maintainer decision and compatibility with v1 and v2 approvals.
- [x] Pre-spec approvals survive parent body edits; a changed parent identity remains unknown.
- [x] Spec and later approvals retain their evidence rules, and workflows without a spec stage retain existing behavior.
- [x] Fake-gh tests and requested checks cover the change.

## Comments

**Codex, 2026-11-01:** Implemented ADR 0015 in projection and fresh checks used by gate approval, brief preview and Ship. The recorded digest is retained; parent identity, complete remote reads, reopen and head checks still apply. Added v1 and v2 coverage, no-spec fallback, changed-parent identity, and a fake-gh flow showing both Spec approval after publishing and later refusal after another body edit.

Changed the existing `parent and ticket revisions invalidate dependent approvals` assertion for parent edits from all three approvals stale to Clarify current and Spec/Tickets stale. In `refuses a later approval when an earlier approval is stale or unknown`, removed the parent-body-change refusal case because it encoded the superseded pre-spec rule; the unavailable-evidence refusal remains.

Checks passed: `pnpm format`, `pnpm format:check`, `pnpm lint` (9 existing warnings), `pnpm typecheck`, and separate `pnpm vitest run` invocations for `packages/core/src/gates.test.ts` (26), `packages/server/src/github-gates.test.ts` (50), `packages/server/src/github-snapshot.test.ts` (7), `packages/server/src/github-tickets.test.ts` (2), and `packages/server/src/github-flow.test.ts` (1). No socket failures occurred. No commit made.
