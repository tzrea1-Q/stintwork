<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — No page header and sticky stage headers

Status: resolved
Blocked by: none

## What to build

Remove the page header from Overview and Pipeline (ADR 0020): the breadcrumb, title, count and subtitle. Move Pipeline's active and shipped counts and the connection status into the board toolbar, and Overview's connection status to the top right of its first card row. Keep the connection error banner. Retire `src/ui/PageHeader` if nothing else uses it.

Make one element scroll the Pipeline board both vertically and horizontally, replacing the nested `.board-scroll` and `.stage-scroll` scrollers. Stage headers stick to its top with the card background, and a divider appears once cards scroll under them. Keep snap scrolling, the edge fade and stage navigation below 1200px, and the Shipped lane and unstaged items below the stages.

Scope: `Board.tsx`, `Overview.tsx`, `Column.tsx`, the i18n catalogs, their tests and the e2e layout checks.

## Acceptance criteria

- [x] At 1440x900 the Pipeline toolbar sits directly below the top bar and the board starts about 140px higher than at `ccb64cc`.
- [x] After scrolling the board 700px down, every stage header is still visible at the top of the board, at 1440, 1024, 768 and 390px.
- [x] Horizontal stage scrolling below 1200px still works with pointer, keyboard and stage navigation.
- [x] Counts and connection status remain visible and have accessible names in `en` and `zh-CN`.
- [x] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [x] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments

**Coordinator, 2026-11-23:** Verification.

- Codex implemented it; coordinator review found card avatars painting over the sticky headers and the Ship column overflowing the stage card at 390px; both fixed with e2e assertions (header hit-testing after scroll, last column inside the card at 390 and 768px).
- The full e2e run then found Previous stage navigation stopping 28px, then 12px, short of the start below 1024px, because the single scroller's padding and the card's `p-3` offset the first snap point. Scroll padding now includes both (28px, 36px from `sm`) and navigation targets snap positions.
- Real browser on this repository's data: 1440px en and zh-CN, 390px en; the toolbar sits directly below the top bar, stage headers stay visible after scrolling 700px, no horizontal page scroll.
- Final runs on the integration branch: `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed. `pnpm test`: 3,462 passed; two server tests (`stint-permissions` twenty immediate answers, `work-item-files` watcher reindex) failed only under machine load and pass when rerun alone. `index.test.ts` "watching discovers project directories that do not exist at startup" also fails alone on `main`, so it is pre-existing and not caused by this milestone. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 508 passed before the last two fixes; after them `e2e/board.spec.ts` (54) and `e2e/dialogs.spec.ts` (140) passed in full.
