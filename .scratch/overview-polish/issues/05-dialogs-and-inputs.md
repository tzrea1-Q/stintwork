<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Create work item, inputs, Jump to and Project setup

Status: resolved
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

- [x] Input and Textarea have behaviour tests (value, disabled, invalid, focus ring).
- [x] Create work item tests cover close, Escape, title and slug errors mapped by code in both languages.
- [x] Browser cases for the three dialogs at 1440 and 390px in both languages pass the layout checks; screenshots are saved.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it in four rounds. Coordinator review found and got fixed: the Pipeline toolbar still said "Create work item"; the dialog description had no spacing; `autoFocus` on Title made Radix restore focus to a removed node, so Cancel and Escape no longer returned focus to the toolbar button (caught by `e2e/dialogs.spec.ts`, fixed through `onOpenAutoFocus` with a jsdom test); `dialogs`, `board` and `motion-overlays` specs looked up the submit by the old name.
- Real data (1440px): the dialog reads "New work item" with a description and a close button with tooltip; focus starts in Title; submit reads "Create". Jump to shows one Esc hint and plain group headings. Project setup uses status chips.
- Browser: `dialogs`, `board` 196/196; `motion-overlays` 9/9 alone. Unit and full browser results as in ticket 01's comment (same integration branch).
