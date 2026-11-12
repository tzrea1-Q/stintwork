<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Overview dashboard

Status: ready-for-agent
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
