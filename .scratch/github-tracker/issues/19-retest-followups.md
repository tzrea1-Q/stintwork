# 19 — M11 retest follow-ups

Status: needs-review
Blocked by: none

## What to build

Fix the four defects found in the 2026-11-09 M11 exit retest: stale discovery must converge through bounded background detail reads without resurrecting cleared handoffs or presenting unknown tickets as blocked; merge confirmation copy must read naturally for each method in both languages; GitHub ticket numbers must consistently use #N in drawer, review and Needs you lists; and Ship previews must avoid duplicate reads and overlap independent reads while preserving fresh merge decisions and single-flight writes.

## Acceptance criteria

- [x] Stale discovery converges without opening the drawer, and stale presentation preserves cleared handoffs and shows unknown tickets as outdated; fake-gh regressions cover both.
- [x] Merge confirmation copy is natural for merge, squash and rebase in English and Chinese, with a test.
- [x] GitHub tickets use #N consistently in ticket lists; local Markdown tickets keep NN, with a test.
- [x] Ship previews overlap independent reads, avoid duplicate reads and reuse fresh identity checks; fake-gh tests cover calls or concurrency and existing refusal and freshness rules remain intact.
- [ ] format:check, lint, typecheck and unit tests for touched packages pass (sandbox-only socket EPERM failures may be recorded).

## Comments

**Codex, 2026-11-09:** Partial work only. Updated `packages/web/src/GateView.tsx`, `NeedsYouQueue.tsx`, `WorkItemCard.tsx`, English and Chinese catalogs, and adjacent web tests: the gate and Needs you format GitHub ticket numbers, the card suppresses Blocked when tickets are stale, and merge confirmation copy covers all three methods. The remaining ticket lists, stale handoff currency, bounded background refresh and Ship latency are not complete. An experimental background refresh was removed after `github-detail-refresh.test.ts` exposed five busy-response failures; experimental Ship changes were also removed.

Checks on the retained changes: `pnpm format:check`, `pnpm lint` (11 warnings), `pnpm typecheck`, and `pnpm vitest run --project web` (56 files, 750 tests) passed. The first full web run failed on outdated copy/number expectations; after updating those expectations, the final run passed. The two preview call TSV files were deleted. No commit was made.

**Codex, 2026-11-09, subsequent run:** Implemented criteria 1 and 3. Changed `packages/server/src/index.ts`, `github-snapshot.ts`, `github-detail-refresh.test.ts`, and `github-snapshot.test.ts`; `packages/core/src/attention.ts`, `attention-handoff-resume.test.ts`, `pull-requests.ts`, and `pull-requests.test.ts`; and `packages/web/src/WorkItemDrawer.tsx`, `StintHistory.tsx`, and the related `WorkItemDrawer`, `StintHistory`, `Stints`, `StintsLanguage`, `StopStint`, and `Recovery` tests. Background detail reads are bounded and shared with explicit requests; stale handoff currency and unknown ticket display are preserved. Ticket labels include the tracker format in history and PR text.

Checks actually run: `pnpm format:check`, `pnpm lint` (11 warnings), and `pnpm typecheck` passed. `pnpm vitest run --project node packages/core` passed (34 files, 1001 tests); `pnpm vitest run --project web` passed (56 files, 751 tests); focused GitHub server tests passed (2 files, 21 tests). The full server suite was attempted but did not pass: TCP tests hit sandbox `listen EPERM`, while recovery and agent-launch tests also timed out or returned unexpected statuses. The saved-handoff recovery timeout reproduced against an untouched `HEAD` archive. The full server run was interrupted; a separate run excluding `stint-history.test.ts` was also interrupted after 289 passes and 15 failures, including those two categories. `pnpm test:e2e` could not start its server because `127.0.0.1:4178` returned `listen EPERM` after building core and web. Criterion 4 and the two `.codex-*.tsv` files were left untouched; no commit was made.

**Codex, 2026-11-09, Ship latency:** Changed `packages/server/src/ship.ts`, `pull-requests.ts`, `github-gates.ts`, `index.ts`, and `pull-requests.test.ts`. Ship overlaps identity with detail and protection with CI reads, uses the final CI-bracketing PR view, and reuses a fresh viewer check. Merge still performs its own CI fetch; refusal order and single-flight writes remain in place. Deleted both retest call TSV files.

Checks actually run: `pnpm format:check`, `pnpm lint` (11 warnings), and `pnpm typecheck` passed. `pnpm vitest run packages/server/src/pull-requests.test.ts packages/server/src/github-item-routes.test.ts` passed (90 tests); `pnpm vitest run packages/server/src/github-gates.test.ts` passed (63 tests); the overlap test passed again after extending its deadline. An initial test command using `--project node` selected no server tests. A redundant filtered run was interrupted after the complete focused files passed. No commit was made.

`pnpm vitest run --project server` reported 20 failures and 24 skips in `stint-history.test.ts`, including TCP cases and recovery timeouts; it was then interrupted. These failures cannot all be described as socket-only `listen EPERM`. The saved-handoff timeout was previously reproduced against untouched `HEAD` as noted above. Criterion 5 remains open for the coordinator's outside-sandbox rerun.
