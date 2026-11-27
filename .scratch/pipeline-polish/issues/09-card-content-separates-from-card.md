<!-- SPDX-License-Identifier: Apache-2.0 -->
# 09 — Card content separates from its card

Status: ready-for-agent
Blocked by: none

## What to build

On 2026-11-27 the maintainer found the Visual fidelity card's content drawn about half a row above its card shape on Pipeline, overlapping the card above. A reload fixed it. The tab had been in the background while the server restarted and live updates arrived.

**Cause, reproduced by the coordinator.** In `WorkItemCard.tsx` the card shell animates its position only when `!skip && !reduced && visible`, but the inner content `m.div` animates its position whenever `visible`. When the board skips continuity (document hidden, or more than 12 changes) or motion is reduced, the shell jumps to its new place while the content starts its own position animation from the old place. Sampling every frame while a live update pushed Visual fidelity one slot right at 1440px:

- visible, full motion: the content followed the shell in every frame;
- `document.visibilityState` hidden, and Reduced: in one frame the shell was at x 535 while the content was still at its old x (221px apart).

In a real background tab Chrome pauses animation frames at that point, so the content stays where it was left until a reload.

Fix:

- The card content never animates its position independently of the card shell. Use one condition for both, and check the other `layout` children on the board (`Board.tsx` lines around 456–463, `Column.tsx`, the Shipped and unstaged lanes) for the same mismatch.
- When the document becomes visible again, no card is left with a stale layout transform.

Also fix the 768px board edge: the last stage's sticky `stage-header` ends at 756px while the `stage-board` ends at 744px, so its card background shows outside the board's rounded corner. Headers stay inside the board at every width.

Scope: `WorkItemCard.tsx`, `Board.tsx`, `Column.tsx`, `board/*`, the stage header styles, and tests. Keep Motion tokens and the rules in `docs/agents/frontend.md`.

## Acceptance criteria

- [ ] A browser spec pushes a snapshot over `/api/live` that moves a card to a new slot (as `e2e/motion-board.spec.ts` does) and samples every frame for 1.5 s. Under reduced motion, under a hidden document and under full motion, the card's content keeps the same offset from its card shell in every frame. The spec fails on the current code.
- [ ] At 768px, with and without the docked panel, no stage header extends beyond `stage-board`.
- [ ] The existing browser suite still passes.

## Comments
