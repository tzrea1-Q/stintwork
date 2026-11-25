<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Overview layout and visuals

Status: ready-for-agent
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

- [ ] At 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark at 1440 and 390px, with this repository's data and the rich fixture: no grid hole wider than one card, no card more than 24px taller than its content, card headers in a row aligned within 1px, and the layout checks pass.
- [ ] No arbitrary pixel, colour or tracking values remain in the Overview files; a test reads the files and fails on `-[` values outside an allow list.
- [ ] Stage legend swatches equal the bar colours; contrast of bars against their track is at least 3:1 in both schemes.
- [ ] The badge shows 7, 42 and 99+ without overflow.
- [ ] `pnpm test` and `e2e/overview.spec.ts` pass. Screenshots are saved as artifacts.

## Comments
