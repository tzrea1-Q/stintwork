<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Balanced stage columns

Status: resolved
Blocked by: 01

## What to build

Collapse each stage with no work items to a rail of about 56px: icon, stage name written vertically, and count. The rail keeps the stage's accessible name and empty-state text and is reachable by keyboard. Selecting it expands the stage for the current session.

Stages with items share the remaining width. At 1440px with the detail panel closed, a stage whose items do not fit one column shows cards in two columns when its width allows two cards of at least 220px. With the panel open, fall back to one column per stage. Below 1024px keep horizontally scrolling columns, with empty stages also collapsed.

Card slugs and titles must not truncate at 1440px with the panel open at its default width, except for deliberately long names, which expose the full text in a tooltip.

Scope: `Column.tsx`, `Board.tsx`, `WorkItemCard.tsx`, their tests and the e2e layout checks.

## Acceptance criteria

- [ ] On this repository's data at 1440x900, Clarify, Spec, Tickets and Ship are rails and Review shows its 12 items in two columns with the panel closed.
- [ ] Rails expand and collapse by pointer and keyboard and announce stage name and count.
- [ ] With the panel open at its default width, no card slug in this repository truncates at 1440px.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px, including a check that rails stay narrow.
- [ ] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it. Coordinator review found three problems, all fixed:
  - A six-item stage stayed a single column with 540px cards. One layout rule now covers every stage: rail, single or grid, from the measured stage width, the viewport and whether the panel is open.
  - Below 1024px, columns grew to max-content (537px). They now have definite widths.
  - The 144px headers were too tall. Rail and full headers now share one compact height.
- The e2e sticky-header hit test now targets `[data-stage-icon]` instead of whatever element sat on top.
- Real browser on this repository's data, in a git clone: 1440px and 390px, en and zh-CN. Empty stages collapse to rails and Implement and Review share the width. With the panel open, the columns stay single and the page has no horizontal scroll.
- Final runs on `board-polish-integration-2`, together with 05:
  - `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed.
  - `pnpm test`: 3,473 passed and 2 failed. `github-stints` "stint completion refreshes GitHub detail (cooldown)" also fails 1 run in 5 on `main`. `index.test.ts` "watching discovers project directories…" is the known failure that predates this milestone.
  - `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 517 passed.
