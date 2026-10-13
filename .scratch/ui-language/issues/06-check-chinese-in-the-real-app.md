# 06 — Check the Chinese UI in the real app

Status: ready-for-agent
Blocked by: 02, 03, 04, 05

## What to build

The spec's manual check (user stories 1, 38 and 40). Open Stintwork on its own repo in a browser preferring `zh-CN` and go through the whole UI:

- the board, the drawer and a real stint (start, a permission request, stop);
- the Needs-you queue, review and ship (up to, but not through, the push confirmation);
- the guided setup and create-work-item;
- the switch back to English.

Fix any English text still showing in Stintwork's own chrome, any clipped or overflowing control, and any term that differs from the glossary. Have the Chinese catalog reviewed by a native speaker and note the reviewer here. Add this work to `docs/plan.md` and `.stintwork/roadmap.md` where it was scheduled.

## Acceptance criteria

- [ ] Comments record the check: screens visited, screenshots or notes, and fixes made.
- [ ] No untranslated Stintwork chrome remains in Chinese mode.
- [ ] The native-speaker review is noted.
- [ ] The plan and roadmap mention the work.
- [ ] All checks pass.
