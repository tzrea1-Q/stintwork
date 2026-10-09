# 07 — Work-item drawer and ⌘K

Status: ready-for-agent
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
