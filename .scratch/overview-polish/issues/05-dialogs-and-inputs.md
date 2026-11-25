<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Create work item, inputs, Jump to and Project setup

Status: ready-for-agent
Blocked by: none

## What to build

Fix spec findings D1–D4 and E3.

- Create work item: one name for the action in both catalogs ("New work item" for entry, title and submit, or another single name), a close button with a tooltip, and a description.
- Add `ui/Input` and `ui/Textarea` from shadcn's source (`pnpm dlx shadcn@4.23.0 view input textarea`), adapted per `frontend.md`, each with a behaviour test. Use them in Create work item. Remove the parent-selector input styling.
- Create work item maps server errors by error code, not English message text, through one function.
- Jump to: one Esc hint; group headings without uppercase or wide tracking.
- Project setup: status icons that do not look like radio buttons (for example a check chip and an attention chip).

Scope: `CreateWorkItem.tsx`, `CommandPalette.tsx`, `SetupGuide.tsx`, new `ui/Input.tsx` and `ui/Textarea.tsx`, the server's create and preview error responses if they lack codes, both catalogs, and tests.

## Acceptance criteria

- [ ] Input and Textarea have behaviour tests (value, disabled, invalid, focus ring).
- [ ] Create work item tests cover close, Escape, title and slug errors mapped by code in both languages.
- [ ] Browser cases for the three dialogs at 1440 and 390px in both languages pass the layout checks; screenshots are saved.
- [ ] `pnpm test` passes.

## Comments
