# 07 — Work-item drawer and ⌘K

Status: resolved
Blocked by: 06

## What to build

In `packages/web`: the drawer and the command palette, per `.scratch/board/spec.md` → "The drawer" and "⌘K".

- Click a card or press Enter on a focused card to open a large right drawer (about 60% of the width). It shows: the title, type and milestone; the stage rail (with inferred marked); the rendered `spec.md` (GFM: headings, lists, checkboxes, code, tables); tickets in dependency order with status, Blocked by and an expandable body; and repo-relative file paths with a copy button.
- Esc closes the drawer. The URL reflects the open work item (`?item=<slug>`) so reloads keep it open.
- ⌘K (Ctrl+K on Linux and Windows): jump to any work item by id or title, and toggle the milestone filter.
- Arrow keys move focus between cards. Visible focus states throughout.

## Acceptance checks

- Component tests: `opens the drawer from a card and closes it with Esc`; `renders tickets in dependency order with Blocked by`; `?item=<slug> opens the drawer on load`; `command palette jumps to a work item`.
- Manually, in this repo: open the `board` drawer, read the spec, and see tickets 01–08 with correct Blocked by lines.

## Out of scope

Editing, starting stints, review.

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** With cmdk 1.1.1, react-markdown 10.1.0 and remark-gfm 4.0.1 installed, two of Codex's extra tests failed: unscoped queries, and a role assumption about sanitized links. Codex fixed the tests (now stricter); no component changes were needed. All checks pass (115 tests, including the four named ones). In the browser on this repo: clicking the card opens the drawer with `?item=board`, the stage rail marks Implement as inferred, the spec renders as GFM, tickets show in dependency order with Blocked by and copyable paths, Esc closes it, and the ⌘K search "board" finds the work item and the M1 filter.
