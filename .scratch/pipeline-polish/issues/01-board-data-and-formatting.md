<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Board data and shared formatting

Status: ready-for-agent
Blocked by: none

## What to build

Fix spec findings A1, B5, the data parts of B4, and add the shared formatting helpers of spec decision 8.

- Stage columns show only work items in flight (`workItemInFlight`). The bottom lane lists merged work items as Shipped and, in a separate group, work items of shipped milestones without a recorded merge, each with Mark as shipped (spec decision 1).
- The toolbar counts in flight and shipped work through the same helper, never a second definition.
- Column headers show running and waiting counts only when one is non-zero.
- Cards:
  - hide the ticket count and bar when the work item has no tickets;
  - show the milestone as "M15" style labels from the roadmap name rather than the raw id;
  - show an agent avatar only for a work item with a live or recorded Stint.
- New helpers, with tests in both languages:
  - `src/time.ts`: relative time ("2 hours ago", "6 weeks ago") and full time from the catalog's language. Overview's private `relativeTime` moves here.
  - `src/short-id.ts`: 8 characters for Stint ids, 7 for commit hashes.
  - an agent display-name lookup from `snapshot.agents` with a capitalised fallback for unknown ids.

  Later tickets use these helpers; this ticket does not change other surfaces.

Scope: `overview-data.ts`, `Board.tsx` (lane, counts and filters only), `Column.tsx` (header counts), `WorkItemCard.tsx` (data fields), `Overview.tsx` (use `src/time.ts`), new `src/time.ts` and `src/short-id.ts`, both catalogs, and tests.

## Acceptance criteria

- [ ] jsdom tests cover:
  - in flight on the board, with merged, shipped-milestone and active items;
  - the two lane groups and their Mark as shipped entry;
  - the toolbar counts;
  - hidden zero counts;
  - cards without tickets or Stints;
  - the helpers in `en` and `zh-CN`.
- [ ] On this repository's data, the columns hold only M15–M18 work items, and the toolbar and Overview agree on the in-flight count.
- [ ] `pnpm test` passes.

## Comments
