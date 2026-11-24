<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Balanced stage columns

Status: ready-for-agent
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
