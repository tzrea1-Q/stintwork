# 19 — M11 retest follow-ups

Status: ready-for-agent
Blocked by: none

## What to build

Fix the four defects found in the 2026-11-09 M11 exit retest: stale discovery must converge through bounded background detail reads without resurrecting cleared handoffs or presenting unknown tickets as blocked; merge confirmation copy must read naturally for each method in both languages; GitHub ticket numbers must consistently use #N in drawer, review and Needs you lists; and Ship previews must avoid duplicate reads and overlap independent reads while preserving fresh merge decisions and single-flight writes.

## Acceptance criteria

- [ ] Stale discovery converges without opening the drawer, and stale presentation preserves cleared handoffs and shows unknown tickets as outdated; fake-gh regressions cover both.
- [x] Merge confirmation copy is natural for merge, squash and rebase in English and Chinese, with a test.
- [ ] GitHub tickets use #N consistently in ticket lists; local Markdown tickets keep NN, with a test.
- [ ] Ship previews overlap independent reads, avoid duplicate reads and reuse fresh identity checks; fake-gh tests cover calls or concurrency and existing refusal and freshness rules remain intact.
- [ ] format:check, lint, typecheck and unit tests for touched packages pass (sandbox-only socket EPERM failures may be recorded).

## Comments

**Codex, 2026-11-09:** Partial work only. Updated `packages/web/src/GateView.tsx`, `NeedsYouQueue.tsx`, `WorkItemCard.tsx`, English and Chinese catalogs, and adjacent web tests: the gate and Needs you format GitHub ticket numbers, the card suppresses Blocked when tickets are stale, and merge confirmation copy covers all three methods. The remaining ticket lists, stale handoff currency, bounded background refresh and Ship latency are not complete. An experimental background refresh was removed after `github-detail-refresh.test.ts` exposed five busy-response failures; experimental Ship changes were also removed.

Checks on the retained changes: `pnpm format:check`, `pnpm lint` (11 warnings), `pnpm typecheck`, and `pnpm vitest run --project web` (56 files, 750 tests) passed. The first full web run failed on outdated copy/number expectations; after updating those expectations, the final run passed. The two preview call TSV files were deleted. No commit was made.
