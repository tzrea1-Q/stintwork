<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Overview dashboard

Status: resolved
Blocked by: 01

## What to build

Rebuild Overview as Variant D's dashboard, using only the derivations in the spec:
- **Milestone card:** a large percentage (work items done, via `workItemDone`) with a progress bar, the `milestone.target` marker, and work item and ticket counts.
- **Where the work is:** stage bars split into running and waiting.
- **Next up:** the gradient hero card.
- **Activity:** a 7-day bar chart of stints by start day, with the recent stint list kept below it or behind a disclosure.
- **Other cards:** Needs you and Running now in D's style.
- **Grid:** D's three-column grid at 1280px and wider, with sensible stacking below.

When no milestone is active or planned, the milestone card shows the most recently shipped milestone; the shipped list stays available. Cards without data are still omitted. Show no trend deltas.

Scope: `Overview.tsx`, `overview-data.ts`, i18n and tests. Add no core or server state.

## Acceptance criteria

- [ ] Unit tests cover the percentage, stage running/waiting split, 7-day counts (including days with none and timezone boundaries) and the shipped-milestone fallback.
- [ ] With this repository's data, Overview shows a milestone card with a percentage and the activity chart, not only a collapsed list.
- [ ] The chart and bars have accessible text equivalents.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.

## Comments

**Coordinator, 2026-11-12:** Verification.

- Pure derivations in `overview-data.ts` with unit tests: milestone percentage via `workItemDone`; running/waiting split per stage, where attention takes precedence over an active stint; 7-day stint counts by local start day, including empty days and timezone boundaries; Stints this week; and the featured milestone, which falls back to the latest shipped one.
- The snapshot has no milestone start date, so the target shows as "Target · <date>" under the bar with no marker. No trend deltas.
- Codex review caught three problems, now fixed: a permission request counted as running; the chart did not roll over at midnight; and CSS `order` made focus order differ from visual order. Cards are now in display order in the DOM.
- The comparison with D on real data led to a polish pass:
  - Titles now use D's measured computed weight of 400; ticket 01 had used 650. The spec sentence is corrected.
  - Grid: the 3-column grid at 1280px and wider stretches each row and leaves no holes.
  - Milestone card: titled by the milestone, with Work items, Tickets resolved and Stints this week rows on light border rules. It shows only the featured milestone; other unshipped milestones go in a compact disclosure.
  - Where the work is: all six stages, with idle items in a visible neutral tone.
  - Next up: a pill at the top, with its content grouped at the bottom.
  - Activity: shows "No stints in the last 7 days" when the week is empty, as it is for this repository today.
- Side-by-side with Variant D in a real browser at 1440 and 390px, en and zh-CN, on this repository's data and the rich fixture (the rich cases' full-page screenshots come from the e2e run).
- Final run on `main` at 96d6e7e (tickets 02–05 plus two polish passes merged): `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3462 passed) and `pnpm build` passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 506 passed.
- Earlier per-branch runs had isolated `ECONNRESET` on the e2e API request and server timing failures while four suites and Codex runs shared the machine. The unit suite and the e2e suite, each rerun alone on `main`, passed in full.
