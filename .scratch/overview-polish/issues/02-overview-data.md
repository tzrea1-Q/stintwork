<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Overview data: in flight, progress, activity and durations

Status: resolved
Blocked by: none

## What to build

Fix spec findings A3–A7 and E2 with the spec's decisions 1–3.

- One module (`overview-data.ts`) defines a work item being done and being in flight (not merged, milestone not shipped). "Where the work is" counts only work items in flight; its total chip matches.
- Milestone progress counts tickets (decision 2). The big percentage, the bar and "Tickets resolved" agree. "Work items x/y" stays.
- "Stints this week" on the milestone card counts the milestone's own work items.
- Activity: the chart stays "Last 7 days"; the list becomes "Recent stints" with relative times and the full time in a `title`; an empty week collapses the chart to its one-line message and keeps the list.
- One duration helper with minutes, hours and days, in both catalogs. Overview's running rows use it now; the Needs you queue adopts it in ticket 04.

This ticket changes data and copy only; the card layout changes in ticket 03.

Scope: `overview-data.ts`, `Overview.tsx` (data wiring only), a duration helper module, both catalogs, and tests.

## Acceptance criteria

- [x] Unit tests cover in flight (merged, shipped milestone, no milestone), ticket-based progress (no tickets, merged, unavailable tickets), the milestone's weekly stints and the duration helper (59 min, 3 h 12 min, 34 days) in both languages.
- [x] On this repository's data, "Where the work is" counts only M15, M16 and M17 work items, M15 shows 83%, and the activity list is headed "Recent stints" with relative times.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-25:** Verification.

- Codex implemented it in one round. `overview-data.ts` owns `workItemInFlight` (not merged, milestone not shipped) and ticket units; `duration.ts` formats minutes, hours and days from both catalogs.
- Real data (this repository, built app): "Where the work is" shows 4 work items, all M15–M17 (before: Review 12, Implement 7); M15 shows 83% with "Tickets resolved 5/6" and "Work items 0/1"; Stints this week 0 for M15; the activity card shows "No stints in the last 7 days" above "Recent stints" with "7 weeks ago" and the full time in a `title`. zh-CN running rows read "已运行 30 分钟".
- Tests: `overview-data.test.ts` covers in flight, progress units and the milestone's week; `duration.test.ts` covers 0, 59, 192 and 49065 minutes in both languages.
- Full suite on the integration branch: format, lint, typecheck and build pass; unit 3597/3597; browser 568 passed, 1 failed (`motion-board` continuity under parallel load, 4/4 alone with `--workers=1`).
