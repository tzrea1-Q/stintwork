<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Docked work item detail

Status: resolved
Blocked by: 04

## What to build

Replace the drawer with a docked work item detail panel at 1024px and wider and a Sheet below 1024px. Use an identity card, property rows including the per-stage agent select, gate checklist with segmented progress, last handoff, stint history and sticky footer with one primary action. Keep every existing drawer behaviour and test, including actions, loading and error states, focus and dismissal.

Scope: Work item detail and its responsive container and tests.

## Acceptance criteria

- [x] All existing drawer behaviours and tests remain covered; per-stage agent selection and every existing action work.
- [x] At 1024 and 1440px detail is docked; at 768 and 390px it is a Sheet with correct focus and dismissal.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Verification.

- At 1024px and wider the detail is a named, non-modal `<aside>` docked beside the board; below 1024px it is the existing modal Sheet. Focus moves to the close button on open, Escape closes, focus returns to the opening card, and `?item=` survives back/forward. Board shortcuts work when focus is outside the docked panel.
- Content: compact identity header (IconChip, title, slug, status chip); one PropertyList with Milestone, Workflow (Customise), Stage and one row per stage with the existing agent select on a shared label column; gate checklist with SegmentedProgress; last handoff; stint history; a bounded footer with one primary action. Stop stays beside the live stint status as a compact control rather than the primary pill. The permission banner is not repeated inside the docked panel.
- Codex review on the branch found: the ticket preview unmounting while a stint starts, which aborts preparation (P1, fixed with a test); the row wrapper still taking space on Overview; board keyboard blocked while docked; and remounting across 1024px. Those first three were fixed. The last is accepted as a known limitation: the inline aside and the portalled Sheet have different React parents, so crossing 1024px while a nested action is open resets it. A later review of the design pass found an unbounded footer in short viewports, now bounded and scrollable.
- Rejected: a descendant override on the board wrapper that restyled stage column headings to dodge a layout check; the real cause was `Column.tsx` and was fixed in ticket 06.
- Coordinator review with this repository's real data at 1440px (en) and 390px (zh-CN) found a nested 160px property scroller, stage names printed three times, a 190px header, ragged select alignment and a 150px footer that hid the recovery badge at 1024px (`stint-recovery.spec.ts:104`). All were fixed and re-reviewed in the browser.
- Final run on `visual-refresh/05-06-integration` (444f570): `pnpm format:check`, `pnpm lint` (existing 11 warnings), `pnpm typecheck`, `pnpm test` (3438 passed), `pnpm build` and `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` (446 passed: 1440, 1024, 768, 390 and 360px, en and zh-CN, light and dark at 1440 and 390px).
