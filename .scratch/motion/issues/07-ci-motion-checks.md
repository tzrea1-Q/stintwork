<!-- SPDX-License-Identifier: Apache-2.0 -->
# 07 — Motion checks on CI

Status: resolved
Blocked by: none

## What to build

Since the M17 motion commits, GitHub CI's second browser shard has failed on `main` in two motion checks that pass on a developer machine:

- `motion-detail.spec.ts` "detail tabs glide and retarget" at 1024 and 390px: the test read the indicator's start position while the indicator was still moving (the detail panel still sliding in, or the previous tab's glide unfinished), so no sampled frame lay strictly between start and end.
- `motion-board.spec.ts` "board snapshot continuity at 1440px": opening the docked panel with the 60-card fixture produced one long task of 99–103 ms (1 worker) or 116–140 ms (2 workers) on the runner, above the 50 ms budget.

Make both reliable on CI without weakening them on a developer machine.

## Acceptance criteria

- [x] The tab-indicator checks wait for the panel and the indicator to rest before measuring; their assertions are unchanged.
- [x] The long-task budget is 50 ms on a developer machine and scaled for the CI runner, and a failure prints the measured durations.
- [x] CI's browser shards pass on the fix's pull request.

## Comments

**Coordinator, 2026-11-25:** Diagnosis and verification.

- A throwaway CI probe ran both files three times with 1 and with 2 workers and logged sampled frames and long tasks. Locally, with CI's settings (bundled Chromium, `CI=1`, 2 workers), both files pass 13/13. With 3x CPU throttling in Chrome, the long task appears locally at 104–142 ms, matching CI, so the runner is about 3x slower than a developer machine.
- An unminified profile of the panel opening under 3x throttling showed about 230 ms of main-thread time:
  - the React commit of the panel;
  - Motion's layout snapshot of every card (`getSnapshotBeforeUpdate` and `willUpdate`, about 84 ms);
  - a forced page layout read in `measureDocumentScroll` (107 ms self time).

  Turning Playwright tracing off did not reduce it.
- Codex implemented the fix in one round:
  - `openDetail` and `movesBetween` wait with `waitForRest` before measuring.
  - "docked detail and navigation motion" still samples the panel's opening.
  - `longTaskBudgetMs` in `e2e/support/frames.ts` is 50 locally and 200 on CI.
- Local results: `motion-board` and `motion-detail` pass 26/26 in Chrome and 26/26 in CI mode (`--repeat-each=2`).
- Follow-up for the Pipeline and detail panel audit: opening the docked panel on a board with many cards costs about 100 ms on a CPU 3x slower than the maintainer's, which drops frames at the start of the panel's motion.
