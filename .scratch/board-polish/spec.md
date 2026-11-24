<!-- SPDX-License-Identifier: Apache-2.0 -->
# Board and detail polish

Status: ready-for-agent

Milestone: M16 · Board and detail polish. See `docs/plan.md`, `GLOSSARY.md`, ADR 0006, ADR 0019, ADR 0020, ADR 0021 and `docs/agents/frontend.md`.

## Problem Statement

On 2026-11-23 the maintainer used the M15 build on this repository's real data (17 work items, 15 milestones) at 1440px and found five problems. The coordinator confirmed each in a real browser:

- **Page header.** Overview and Pipeline open with a breadcrumb, a 39px title, a count, a subtitle and connection status. Together with spacing they take about 140px and repeat the top bar's pill navigation.
- **Column headers scroll away.** The board scrolls vertically in `.board-scroll` and horizontally in `.stage-scroll`. Because the horizontal scroller sits inside the vertical one, the stage headers (Clarify, Spec and so on) cannot stick and leave the screen as soon as the board scrolls.
- **Unbalanced columns.** Review holds 12 items in one 221px column, 1,659px tall, while Clarify, Spec, Tickets and Ship are empty but keep full width. With the detail panel open, card slugs truncate to "visual-f…".
- **Review is full of finished work.** Those 12 items belong to shipped milestones and have every ticket resolved, but they were merged outside Stintwork, so there is no merge record and the board infers Review. "17 active · 0 shipped" is wrong for this repository.
- **Rough roadmap editor.** Each field has its own submit button with long labels ("Set status for M15 · Visual fidelity"). Row progress disagrees with the board (M5 is shipped but shows 0/1). A milestone's work items are not visible. Moving a work item is a separate form of selects at the bottom.
- **Small, unstructured detail.** The panel is 432px wide and one 4,850px column: the gate, the full spec, all six ticket bodies, then stint history. "Spec" and "Tickets" at the top are anchor links, not tabs. Every ticket, including resolved ones, has a Start stint button. The gate card's progress bar is full while 5 of 6 tickets are resolved.

## Solution

Give the board the vertical space and a stable frame, balance the columns, let the developer record merges made outside Stintwork, rebuild the roadmap editor as a two-pane dialog, and turn work item detail into a wider, tabbed, resizable panel that can go full screen.

## User Stories

1. As a developer, I want the board to start right below the toolbar, so more work items fit on screen.
2. As a developer, I want stage headers to stay visible while I scroll a long column.
3. As a developer, I want empty stages to take little space and busy stages to use it.
4. As a developer, I want to mark work merged outside Stintwork as Shipped, so the board reflects reality.
5. As a developer, I want to edit a milestone in one place and see which work items it holds.
6. As a developer, I want work item detail organised so I find the gate, the next step, the spec or a ticket without scrolling through everything.
7. As a developer, I want to widen the detail panel or expand it to full screen when I read a spec.

## Implementation Decisions

- **No page header (ADR 0020).** Remove the breadcrumb, title, count and subtitle from Overview and Pipeline. Pipeline's toolbar shows the active and shipped counts and the connection status. Overview shows the connection status at the top right of its first card row. Keep the connection error banner.
- **One board scroller.** Make one element scroll the board in both directions. Stage headers are `position: sticky` at its top with the card background and a divider that appears once content scrolls under them. Keep snap scrolling and stage navigation below 1200px.
- **Column widths.** A stage with no work items collapses to a rail of about 56px showing the icon, the stage name written vertically and the count; it keeps its accessible name and empty-state text. Selecting it expands it for that session. Stages with items share the remaining width. At 1440px with the panel closed, a stage with more items than fit in one column shows cards in two columns when its width allows at least two 220px cards. Below 1024px keep today's horizontally scrolling columns, with empty stages also collapsed.
- **Mark as shipped (ADR 0021).** A secondary action in the detail for local Markdown work items without a merge record, a running stint or a Stintwork worktree. It opens a Dialog that explains the effect, takes the merge commit (prefilled with the main checkout's `HEAD`) and confirms. The server checks the commit exists and is reachable from the main checkout's branch, writes `merged: { at, commit, outside: true }` to the work item's workflow file and commits it like every gate write. The item then moves to the Shipped lane. Detail shows "Merged outside Stintwork" with the commit. No bulk action.
- **Roadmap editor.** Keep the Edit roadmap entry point and the Dialog, widened to about 960px. Left pane: the milestone list (name, id, status chip, progress) with reorder by keyboard and pointer, and Add milestone at the top. Right pane: the selected milestone, with name, status as a segmented control and target date as inline fields, its work items with a Move to milestone control per row, and one Save button that writes all of that milestone's changes as one commit. Progress counts shipped work items, the same `workItemDone` derivation Overview and the milestone filter use. Below 768px the panes stack and the list becomes a select. Unsaved changes are kept when switching milestones only after confirmation.
- **Detail panel.** Docked at 1024px and wider, opening at 560px and resizable from 400px to 60% of the viewport by dragging its left edge or with arrow keys on the separator. The width is remembered per viewer in `localStorage`, guarded by try/catch. An expand button fills the area below the top bar; collapse returns to the docked width. Full screen is reflected in the URL (`detail=full`) so reload keeps it. Esc first leaves full screen, then closes. Below 1024px detail stays a Sheet.
- **Detail content.** A fixed identity header (title, slug, milestone, workflow, current stage, primary action) above tabs:
  - **Overview:** current stage and gate with correct progress, the next ready ticket and Start stint, the last handoff, open warnings, Agents by stage, and Mark as shipped when available.
  - **Spec:** the spec with a table of contents from its headings and the copy-path action.
  - **Tickets:** a compact list with number, title, status chip and blockers. Selecting a ticket shows its body. Start stint appears only on tickets that can start.
  - **Stints:** stint history.
  Omit the Tickets tab for workflows without a tickets stage. The selected tab is part of the URL (`tab=`).
- Reuse `src/ui/` primitives (Tabs, Dialog, Sheet, Tooltip). Add a resizable handle primitive only if no existing one fits, following `docs/agents/frontend.md`.

## Testing Decisions

- Behaviour tests in jsdom for: collapsed rail expand and accessible names; Mark as shipped validation, confirmation and cancel; roadmap editor save, reorder and move by keyboard; detail tabs, resize by keyboard, full screen enter and leave, Esc order and focus return.
- Core and server tests for the outside merge record: parse and write, reachability check, refusal while a stint runs or after a merge, refusal for GitHub-tracked items, and the commit.
- Browser suite at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark at 1440 and 390px. Add checks: stage headers stay visible after scrolling the board, empty rails stay narrow, the detail panel's resized width stays within the viewport, and full screen leaves no horizontal page scroll.
- Every UI ticket's Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and on this repository's real data, and the coordinator's review.

## Out of Scope

- Inferring Shipped from milestone status or resolved tickets.
- Bulk Mark as shipped and marking GitHub-tracked work items.
- New Overview cards or data, a Roadmap page, and drag and drop of cards between stages.

## Further Notes

The coordinator's 2026-11-23 check measured the numbers above at 1440x900 against this repository at `ccb64cc`. M15's exit (visual-fidelity 06) stays open and is reviewed separately; this milestone changes the layout rules that review compares against.
