# 04 — Existing dialogs on the shared Dialog

Status: ready-for-agent
Blocked by: 01

## What to build

Move create work item, roadmap editor, customise workflow, brief preview, review overlay and the command palette's dialog shell onto `src/ui/Dialog`, following `docs/agents/frontend.md`. Keep cmdk for palette search and navigation. Replace native dialog shells and repeated focus and dismissal handling with the primitive's hooks.

Preserve forms, validation, previews, review evidence and actions. Preserve pending-save dismissal guards and focus return. When one dialog opens over a sheet or dialog, Escape and outside clicks affect only the topmost layer. Keep review usable as a large overlay within the viewport gutter; long diffs scroll in their own container.

Add browser specs for all six surfaces at the standard widths and languages, covering their applicable loading, empty, error and long-content states. Update existing behaviour tests for the shared shell without weakening their action assertions.

## Acceptance criteria

- [ ] All six surfaces use Dialog; the command palette keeps cmdk. Behaviour tests cover keyboard use, accessible names, focus containment and return, Escape and outside clicks where permitted.
- [ ] Existing actions, validation, previews and pending-save guards pass their behaviour tests. Nested-overlay tests close only the topmost layer.
- [ ] Each surface's browser spec passes at 1440, 1024, 768 and 390px in `en` and `zh-CN`, including applicable loading, empty, error and long-content cases.
- [ ] At those widths in both languages, overlays stay within 16px viewport gutters, essential actions and text remain reachable, diffs scroll internally and the page has no horizontal scroll. Layout supports 360px.
- [ ] Screenshots are saved. Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages.

## Comments
