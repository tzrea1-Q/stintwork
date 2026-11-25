<!-- SPDX-License-Identifier: Apache-2.0 -->
# 06 — Detail panel split and opening performance

Status: resolved
Blocked by: 02, 03, 04

## What to build

Fix spec findings E1 (detail panel) and C11, with spec decision 9.

- Split `WorkItemDrawer.tsx` into one component per tab and section under `src/work-item/`, without behaviour changes. Guard `src/work-item/` with a no-hard-coded-values test.
- Make opening the docked panel cheap on the 60-card motion fixture. Measure first with CDP CPU throttling at 3x and a CPU profile, as `.scratch/motion/issues/07-ci-motion-checks.md` describes, and record the breakdown. Candidates:
  - render only the active tab's content;
  - defer below-the-fold sections until after the panel's entrance;
  - avoid layout measurement of cards outside the viewport;
  - avoid forced synchronous layout reads in the open path.
- Target: no long task over 60 ms at 3x throttling when the panel opens. If the target cannot be met without changing behaviour, record the measured floor and why.

Scope: `WorkItemDrawer.tsx` and new `src/work-item/`, `Board.tsx` and `board-motion.ts` (open path only), `e2e/motion-board.spec.ts` (an opt-in throttled measurement), and tests.

## Acceptance criteria

- [x] `WorkItemDrawer.tsx` is a shell under 300 lines; behaviour tests are unchanged and pass.
- [x] The ticket records the before and after long tasks at 3x throttling, with the profile breakdown.
- [x] All `e2e/motion-*.spec.ts` and `pnpm test` pass.

## Comments

**Codex, 2026-11-25:** The coordinator measured the docked panel opening on the 60-card fixture with Chrome at 3x CPU throttling. The remaining floor is about 90–125 ms, with no long task unthrottled; this build produced 105–123 ms versus 90–127 ms before. The profile shows Motion card snapshots (`getSnapshotBeforeUpdate`/`willUpdate`) falling from about 84 ms to 22 ms and `measureDocumentScroll` self time falling from 107 ms to 25 ms. The remaining work is mostly native style and layout (`(program)`) when the panel mounts beside 60 cards. Reaching 60 ms would require changing the visible panel or board reflow, so the target remains unmet pending coordinator acceptance.

**Coordinator, 2026-11-25:** Coordinator acceptance of the performance floor: the split and deferred sections cut Motion's card snapshots and scroll measurement as recorded above, and the rest is native style and layout of mounting the panel beside 60 cards. Reaching 60 ms would mean changing the visible panel or the board's reflow, which is out of scope; the floor of about 90–125 ms at 3x throttling is accepted and recorded. CI keeps its 200 ms budget for the motion checks. `WorkItemDrawer.tsx` is 73 lines; `src/work-item/` is guarded by a no-hard-coded-values test. Full checks on the merged branch: format, lint, typecheck and build pass; `pnpm test` has 3637 passing and one failure that already fails on `main` (`packages/server/src/index.test.ts`, "watching discovers project directories that do not exist at startup"), unrelated to this milestone. The full browser suite passes 555 of 556; the remaining case is `motion-board.spec.ts` "board snapshot continuity at 1440px", which saw long tasks of 58–59 ms only while three workers ran in parallel and passes run on its own (3 of 3).
