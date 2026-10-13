# 03 — Work-item drawer and Needs you on Sheet

Status: ready-for-agent
Blocked by: 01

## What to build

Move `WorkItemDrawer.tsx` and `NeedsYouQueue.tsx` onto the shared Sheet, following `docs/agents/frontend.md`. Replace their native dialog shells and repeated focus and dismissal code with Radix handling. Preserve the work-item drawer's sections, stints, actions and nested review, and the Needs-you queue's answers and navigation.

Keep sheets inside the 16px viewport gutter. Make long specs, tickets, paths, names and attention items scroll within the sheet. Preserve focus return when closing or navigating to a work item. Closing a nested overlay dismisses only that layer. Drawer language-menu reuse belongs to ticket 05.

Add drawer and Needs-you browser specs with loading, empty, error and long-content cases where applicable, at all four widths in both languages. Keep the existing behaviour tests and update their shell expectations.

## Acceptance criteria

- [ ] Both screens use Sheet. Behaviour tests cover open, close, Escape, outside clicks, focus containment and return, keyboard actions and nested-overlay dismissal.
- [ ] Existing drawer actions, queue answers and work-item navigation retain their behaviour and state.
- [ ] Browser specs pass at 1440, 1024, 768 and 390px in `en` and `zh-CN`, including long content and applicable loading, empty and error states.
- [ ] At those widths in both languages, sheets stay within 16px viewport gutters, content scrolls internally, essential controls remain reachable and the page has no horizontal scroll. Layout supports 360px.
- [ ] Screenshots are saved. Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages.

## Comments

**Codex, 2026-10-13:**

- Migrated `WorkItemDrawer.tsx` and `NeedsYouQueue.tsx` to the existing shared Sheet/SheetContent/SheetTitle/SheetClose. Removed native dialog lifecycle and shell CSS; the shared primitive now owns modal focus containment, Escape and outside dismissal. Auto-focus/close-focus hooks preserve the actual opener, avoid stealing the board's deliberate card focus, and prevent queue teardown from stealing focus during work-item navigation. Programmatic initial close-button focus does not open its tooltip, preserving single-Escape closing; keyboard-focused tooltips still dismiss only their own layer.
- Preserved drawer sections, tickets, stints, gate/ship actions, archived evidence and nested review, plus queue permission/handoff/memory/gate answers, login refresh and notification state. Drawer-native nested dialogs are guarded against the parent Sheet's Escape handling during the parallel ticket 04 migration. Direct controls now use shared Buttons and matching icon Tooltips. The drawer's long title deliberately truncates with its complete title available. Sheet width/height use the shared 16px gutter limits, with internal scrolling and reachable header/footer controls. Only obsolete drawer rules were removed from `style.css`; unrelated rules, dependencies and lockfile are unchanged.
- Added red-green behaviour coverage for portal mounting, keyboard focus containment, close/Escape/outside dismissal, focus return, queue-to-drawer navigation and nested review dismissal. Updated the existing board cancellation and drawer-language tests for Radix modality without dropping their action/state assertions; queue language-context updates still retain the developer note. No missing UI wrapper was needed.
- Added `packages/web/e2e/drawer-and-needs-you.spec.ts` with 28 cases: both surfaces at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, plus dark cases at 1440/390. It uses the shared fixture server and layout checker, with scoped HTTP/WebSocket fixtures for long specs/tickets/paths/code/attention items, drawer agent-loading/error/empty states, queue answer-pending/error/retry/empty states, navigation, local scrolling and screenshots of every exercised open sheet/state. The new source has its Apache-2.0 SPDX header.
- Passing checks: `pnpm --config.verify-deps-before-run=false format:check`; `pnpm --config.verify-deps-before-run=false lint` (306 package source headers; existing Biome configuration deprecation notice); `pnpm --config.verify-deps-before-run=false typecheck`; `pnpm --config.verify-deps-before-run=false --filter @stintwork/web test --configLoader native src/WorkItemDrawer.test.tsx src/NeedsYouQueue.test.tsx src/Board.test.tsx src/Language.test.tsx src/BriefPreview.test.tsx` (102/102 in 5 files); `pnpm --config.verify-deps-before-run=false --filter @stintwork/web build --configLoader native` (existing dependency directive/chunk-size warnings); `pnpm --config.verify-deps-before-run=false --filter @stintwork/web exec playwright test --list` (44 collected, including these 28 new cases); and `git diff --check`. Built CSS inspection confirmed the viewport max-width/max-height, responsive minimum drawer width and 560px queue width declarations.
- Full web check: `pnpm --config.verify-deps-before-run=false --filter @stintwork/web test --configLoader native` finishes with **475 passing / 2 failing** tests in 41 files. The two failures are `CustomiseWorkflow.test.tsx`'s drawer-entry preview/confirmation and Cancel/Escape tests: the still-native sibling CustomiseWorkflow dialog lives under the application root that the modal Sheet hides. This is an integration dependency on ticket 04's shared Dialog migration, not a green full-suite result. CustomiseWorkflow source/tests were deliberately left to its parallel owner; the coordinator must rerun the full web suite after integration.
- Browser execution and screenshot review were **not run** here because this sandbox cannot bind the harness server socket; collection/typechecking/build are not browser evidence. The coordinator must execute these cases and review 1440/390px in both languages before acceptance. Ticket 05 still owns remaining feature CSS/control migration, the drawer's shared language menu and cleanup of temporary native-dialog compatibility after 04. Ticket 06 owns full cross-screen integration/CI evidence. Status is unchanged; nothing committed or pushed.
