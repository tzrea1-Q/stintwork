<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Board layout, narrow widths and cards

Status: ready-for-agent
Blocked by: 01

## What to build

Fix spec findings B1–B4 (visuals), B6, B7, A10 and the board half of E1, with spec decisions 2–4.

- At 768px and wider, empty stages keep a narrow column with icon, count and a horizontal name, never rotated or stacked text.
- When columns overflow, the board shows edge fades and labelled previous/next buttons in its own header. Remove the toolbar's unlabelled arrows.
- Below 768px, a stage switcher (every stage with its count, scrollable, keyboard operable) shows one stage at a time with full-width cards. The toolbar fits in at most two rows and the counts never sit alone on a line.
- Cards:
  - drop the repeated sparkle icon, or replace it with the work item's workflow mark only when the board shows more than one workflow;
  - show status through a status edge or chip rather than filling the whole card;
  - keep the selected card's violet ring.
- The Shipped lane uses `ui/Disclosure`. The board card has no fixed minimum height.
- Chinese uses "规格" for the Spec stage everywhere (board, tabs, catalog); add it to `GLOSSARY.md`'s Chinese table if missing.
- Move the toolbar, lanes and stage switcher out of `Board.tsx` into `src/board/`. Replace arbitrary values in board, column and card files with tokens, and guard `src/board/` with a no-hard-coded-values test like `src/overview/no-hardcoded.test.ts`.

Scope: `Board.tsx`, new `src/board/`, `Column.tsx`, `WorkItemCard.tsx`, `board-motion.ts` (only if the narrow layout needs it), `styles/tokens.css`, `GLOSSARY.md` (Chinese table only), both catalogs, `e2e/board.spec.ts` and tests.

## Acceptance criteria

- [ ] Browser cases at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px, using real-shaped data and the rich fixture, assert:
  - no card cut by the board's edge without a visible fade and previous/next control;
  - no rotated text;
  - exactly one stage's cards visible below 768px;
  - a toolbar of at most two rows;
  - the layout checks.
- [ ] jsdom tests cover the stage switcher's keyboard use and the previous/next buttons.
- [ ] `e2e/motion-board.spec.ts` and `pnpm test` pass.

## Comments
