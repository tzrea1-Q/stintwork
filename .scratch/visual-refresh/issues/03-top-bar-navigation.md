<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Top bar and navigation

Status: resolved
Blocked by: 02

## What to build

Replace the top bar with project and branch, centred pill navigation between Overview and Pipeline, Jump to (⌘K), Needs you and Settings; no sidebar. Put the current view in the URL. Preserve all ui-foundations 09 rules: Settings language radio and persistence, Project setup count and warning dot, focus return, responsive labels and tooltips; Needs you counts attention items and shows project warnings separately, including empty states and accessible warning descriptions. Preserve shortcuts, palette destinations and milestone commands.

Scope: Top bar, view navigation, URL and related tests; keep existing actions and entry points.

## Acceptance criteria

- [x] Navigation and URL restore the current view; controls and their existing keyboard, warning, language, setup and focus behaviours remain available.
- [x] The bar fits without wrapping at 768 and 390px; long names expose their full text.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Verification.

- Top bar with project and branch, centred Overview · Pipeline pills (`?view=`, default Pipeline until ticket 06), Jump to, Needs you and Settings. Overview shows an `Empty` placeholder with a Pipeline action.
- Screenshot review found the nav pinned beside the branch pill and an orange "0" Needs you badge; fixed (three-column grid at 1024px and wider; badge only above zero).
- `codex review --base main` found four P2 issues, fixed with tests that fail before the fix: the Pipeline `<main>` stays mounted (`hidden`) on Overview so the roadmap editor and pending-save guards survive Back/Forward; palette milestone filters switch to Pipeline; Overview shows connection status and errors; view switches focus the selected nav pill.
- The top-bar spec re-resolved the milestone trigger after Radix hid the page (`count()` 1 before opening, 0 after, on main too); it now measures the trigger before opening. After the merge the locator matches the picker's name in either language because the spec switches language mid-test.
- Two failures during parallel runs were environmental (port 4301 held by another app; one `ECONNRESET`), and one server test (`stint-history` SIGKILL) timed out under load; each passed when rerun alone.
- Final run on merged `main`: `pnpm format:check`, `pnpm lint` (existing 11 warnings), `pnpm typecheck`, `pnpm test` (3408 passed) and `pnpm build` pass. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` passed 418 of 432; the 14 remaining `dialogs.spec.ts:419` cases came from a later brief-preview tooltip change, which was reverted (see ticket 07), after which `dialogs`, `agent-preparation`, `board`, `top-bar` and `drawer-and-needs-you` specs pass (224 + 85 cases).
- Coordinator review of screenshots at 1440 and 390px in both languages and both schemes after the merge: accepted.
