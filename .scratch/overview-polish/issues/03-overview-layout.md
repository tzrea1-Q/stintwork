<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Overview layout and visuals

Status: resolved
Blocked by: 02

## What to build

Fix spec findings B1–B6, B8–B13, E1 and E4 on Overview and the top bar.

- A grid with no holes when cards are omitted, and cards sized to their content; Next up keeps its gradient without empty space.
- Card headers align across a row. Milestone card: no orphan "Progress" label, no repeated "completed" line, `ui/Disclosure` for more and shipped milestones.
- Stage bars and charts use status tokens with legends whose swatches match the bars, including Other, and stay readable in dark mode.
- The connection status joins the page without its own row and is clearly visible when reconnecting. The pending-permissions banner becomes a styled callout inside the content width with an icon and an action.
- Distinguishable agent avatars (spec Implementation Decisions).
- A useful empty state: a short explanation and one primary action, without a Pipeline button that leads to an empty board.
- No hard-coded sizes or colours: add type-scale and colour tokens (OKLCH, light and dark) for the display number and Next up title and button.
- Top bar and content share one maximum width and gutters. The Needs you badge fits 2 digits and shows "99+" above 99. The top bar's icon buttons share one variant. Replace the text-glyph logo with an SVG mark.
- The big percentage and counts roll and progress fills, through the existing `RollingNumber` and Progress.
- Split `Overview.tsx` into one component per card in `src/overview/`, remove the duplicated milestone list and the unused catalog keys.

Scope: `Overview.tsx` and new `src/overview/` files, `Board.tsx` (banner only), `TopBar.tsx`, `ui/AgentAvatar.tsx`, `styles/tokens.css`, both catalogs, `e2e/overview.spec.ts` and tests.

## Acceptance criteria

- [x] At 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark at 1440 and 390px, with this repository's data and the rich fixture: no grid hole wider than one card, no card more than 24px taller than its content, card headers in a row aligned within 1px, and the layout checks pass.
- [x] No arbitrary pixel, colour or tracking values remain in the Overview files; a test reads the files and fails on `-[` values outside an allow list.
- [x] Stage legend swatches equal the bar colours; contrast of bars against their track is at least 3:1 in both schemes.
- [x] The badge shows 7, 42 and 99+ without overflow.
- [x] `pnpm test` and `e2e/overview.spec.ts` pass. Screenshots are saved as artifacts.

## Comments

**Coordinator, 2026-11-25:** Verification.

- Codex implemented it in two slices (03a layout and card split, 03b colours, avatars, logo, badge and rolling numbers) and three fix rounds from the coordinator's real-data review:
  - Columns were measured after first paint, so the page flashed a one-column layout; now measured in a layout effect.
  - The milestone card's gap was larger than its neighbours'.
  - With fewer cards than columns, cards stretched to fill the row; the measured column count is now kept, with trailing empty columns as spacers.
- Layout: cards stack in measured columns (3 at 1280px and wider, 2 from 769px, 1 below), each in a fixed reading order; a column with spare cards fills an empty one.
- Real data at 1440, 1024, 768 and 390px in both languages and both schemes: no holes, Next up sized to content, headers aligned, the offline state as an attention callout, the pending-permissions banner inside the content width.
- The acceptance checks were missing from the browser cases, so a further Codex round added `e2e/overview-checks.ts`, run in every rich and real-data Overview case:
  - no hole except trailing spacer columns, and no card more than 24px taller than its content;
  - first headers aligned within 1px;
  - every legend swatch equal to its bar colour, with bars at least 3:1 against the track;
  - a case for the badge at 7, 42 and 99+.
  A mutation (changing a swatch's colour) failed the check as expected.
- `src/overview/no-hardcoded.test.ts` fails on arbitrary `-[` values outside its allow list.
- Browser: `overview.spec.ts` 43/43, screenshots saved as test outputs. Full suite: see ticket 02.
