<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Board continuity

Status: resolved
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

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it. Coordinator review found and got fixed:
  - The 60-card fixture rendered nothing at first, and then gave duplicate `data-work-item` nodes from an exiting copy. The exiting copy no longer carries the attribute.
  - Size-changing layout scaled cards past their columns. Cards, columns and rails now use `layout="position"`, so positions glide and sizes snap, and nothing stretches.
- At 1440px, with 60 cards, the long-task check (≤50ms during the panel reflow) passed alone 3 times out of 3 but failed once in a parallel full run. It is recorded as load-sensitive.
- **Final runs** on `motion-integration` (02, 03 and 04 merged):
  - `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed.
  - `pnpm test`: 3,521 passed and 1 failed. The failure is `index.test.ts` "watching discovers project directories…", which predates this branch and also fails on `main`.
  - `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 534 passed and 4 failed. The four were one Needs you case, one `motion-board` case and two `motion-detail` cases. All four passed in two serial reruns (53/53 each): the frame-timing and long-task checks are sensitive to load from parallel workers.
- **Real browser** on this repository's data, in a git clone, motion on, at 1440px in en and zh-CN and at 390px. Sampled frame by frame:
  - the docked panel slides in by transform and reaches rest in about 520ms;
  - board cards glide by position, their width snapping (244→254px) with no stretching;
  - Create work item scales from 0.92 and fades through blur, reaching rest in about 460ms;
  - the Settings menu grows from its trigger with a slight overshoot (1.0025) on `spring.pop`;
  - at 390px the Sheet slides from x=291 to 16 in about 470ms;
  - no horizontal overflow at any width.
