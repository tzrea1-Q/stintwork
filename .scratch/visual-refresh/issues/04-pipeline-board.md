<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Pipeline board

Status: resolved
Blocked by: 02

## What to build

Rebuild Pipeline as a rounded board card. Give stage headers an icon chip, count and one-line stat; use state-tinted work item cards, slim empty columns and a collapsed Shipped row. Put milestone and workflow pickers and the primary New work item action in the page toolbar. Preserve filtering, URL/state, long-name access, existing actions and keyboard behaviour.

Scope: Pipeline board, toolbar and behaviour tests; detail panel belongs to 05.

## Acceptance criteria

- [x] Board states, pickers, collapsed Shipped and New work item work with existing data and actions.
- [x] Board scrolling remains contained, including narrow widths; long labels remain accessible.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Verification.

- Board is one rounded card with stage columns (IconChip header, count, derived stat), state-tinted cards with StatusChip, AgentAvatar and SegmentedProgress, slim empty columns, a collapsed Shipped row, and milestone and workflow pickers with the single primary Create work item action in the toolbar.
- First browser run: 236 failures from "Document horizontal overflow: 872 > 390". Traced in a real browser: the board scroller was correctly sized, but `sr-only` labels in slim empty columns had `offsetParent = body` and escaped the clipped board. `.stage-scroll` and each `.stage-column` are now `relative`; a Playwright assertion guards the containing block.
- Codex's fix for the top-bar milestone failure added `aria-live="off"` to the pickers to escape Radix's `aria-hidden`; that workaround was reverted because main has the same race, and the spec was fixed in ticket 03 instead.
- Screenshot review at 1440px found two-column boards stretching cards to about 550px and inconsistent slim column labels; non-empty columns now cap at 340px and empty columns stack name and count the same way.
- Final run on merged `main`: `pnpm format:check`, `pnpm lint` (existing 11 warnings), `pnpm typecheck`, `pnpm test` (3408 passed) and `pnpm build` pass. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` passed 418 of 432; the 14 remaining `dialogs.spec.ts:419` cases came from a later brief-preview tooltip change, which was reverted (see ticket 07), after which `dialogs`, `agent-preparation`, `board`, `top-bar` and `drawer-and-needs-you` specs pass (224 + 85 cases).
- Coordinator review of screenshots at 1440 and 390px in both languages and both schemes after the merge: accepted.
