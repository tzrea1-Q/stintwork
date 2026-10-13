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
