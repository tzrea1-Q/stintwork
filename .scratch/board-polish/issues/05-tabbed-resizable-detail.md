<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Tabbed, resizable detail

Status: ready-for-agent
Blocked by: 01, 03

## What to build

Turn work item detail into a fixed identity header above tabs, in a panel that can be resized and expanded (ADR 0020).

- **Container:** at 1024px and wider, a docked panel opening at 560px, resizable from 400px to 60% of the viewport by dragging its left edge or with arrow keys on a focusable separator. Remember the width per viewer in `localStorage`, guarded by try/catch. An expand button fills the area below the top bar and collapse returns to the docked width; full screen is in the URL as `detail=full`. Esc leaves full screen first, then closes, returning focus to the card. Below 1024px keep the Sheet.
- **Header:** title, slug, milestone, workflow, current stage and the primary action. It stays visible while tab content scrolls.
- **Tabs** (`tab=` in the URL):
  - Overview: current stage and gate, with progress matching resolved tickets; the next ready ticket with Start stint; the last handoff; open warnings; Agents by stage; Mark as shipped when available (ticket 03).
  - Spec: the spec with a table of contents from its headings and the copy-path action.
  - Tickets: number, title, status chip and blockers in a compact list. Selecting a ticket shows its body. Start stint only on tickets that can start.
  - Stints: stint history.
  Omit Tickets for workflows without a tickets stage.
- Keep every existing detail action, gate, review, brief preview and customise entry point. Remove the anchor links that imitate tabs.

Scope: `WorkItemDrawer.tsx` and the components it renders, `Board.tsx` for the panel container, `src/ui/` for a resize handle if needed, i18n catalogs and tests.

## Acceptance criteria

- [ ] On this repository's `visual-fidelity` item, Overview shows the gate with 5/6 progress and ticket 06 as next, without the spec or ticket bodies.
- [ ] Resize, expand, collapse, tab switching and Esc work by keyboard and pointer; focus returns correctly.
- [ ] Width and full screen persist across reload; blocked `localStorage` does not break the panel.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px, including the resized panel within the viewport and full screen without horizontal page scroll.
- [ ] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments
