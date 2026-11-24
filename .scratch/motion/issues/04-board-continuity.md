<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Board continuity

Status: ready-for-agent
Blocked by: 01

## What to build

**Continuity:**

- Cards keep `layoutId` set to their slug inside one `LayoutGroup`. A card that changes stage on a live update glides to its new column on `spring.layout`.
- Columns and cards reflow on `spring.layout` when the docked panel opens, closes or goes full screen, when rails expand or collapse, and when a stage switches between one column and a grid.

**Arrivals and removals:**

- New cards arrive on `spring.arrive` from `shift.arrive` and `blur.surface`.
- Removed cards fade and shrink to `scale.removedCard` on `tween.dismiss`.
- On the first board load of a page, cards stagger in per column, once (`stagger`: at most 12 items and 300ms).

**Numbers.** Stage counts, the toolbar's active and shipped counts, and card ticket counts roll on `spring.number` with tabular numerals.

**Press.** Cards get press feedback at 0.985.

**Guards.** When one snapshot changes more than 12 cards, or the document is hidden, the board jumps to the result.

Scope: `Board.tsx`, `Column.tsx`, `WorkItemCard.tsx`, their tests, the e2e fixture's live-update helpers and `e2e/motion.spec.ts`.

## Acceptance criteria

- [ ] In the browser, a live update that moves a card to another stage shows it mid-way between the columns on an early frame. It ends in the new column.
- [ ] Opening the docked panel reflows cards by transform, with no frame where a card is wider than its column. At 1440px, no long task exceeds 50ms during the reflow on a 60-card fixture.
- [ ] The first-load stagger runs once and not on later snapshots. A 13-card change jumps.
- [ ] Under reduced motion, cards move instantly and counts change without rolling.
- [ ] The full browser suite passes. Comments include the coordinator's normal-speed and 10%-speed review on this repository's real data.
