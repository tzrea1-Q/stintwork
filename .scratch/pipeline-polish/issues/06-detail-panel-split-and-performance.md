<!-- SPDX-License-Identifier: Apache-2.0 -->
# 06 — Detail panel split and opening performance

Status: ready-for-agent
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

- [ ] `WorkItemDrawer.tsx` is a shell under 300 lines; behaviour tests are unchanged and pass.
- [ ] The ticket records the before and after long tasks at 3x throttling, with the profile breakdown.
- [ ] All `e2e/motion-*.spec.ts` and `pnpm test` pass.

## Comments
