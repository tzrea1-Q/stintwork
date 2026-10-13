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

- [x] Comments record the check: screens visited, screenshots or notes, and fixes made.
- [x] No untranslated Stintwork chrome remains in Chinese mode.
- [ ] The native-speaker review is noted.
- [x] The plan and roadmap mention the work.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Walk-through in Chinese (`stintwork.language` = `zh-CN`).

On Stintwork's own repo:
- the board and drawer;
- warnings, setup and the command palette;
- create work item (not submitted);
- the roadmap editor and customise workflow (not confirmed).

On a throwaway repo, a real Claude Code stint at the Ask level:
- five permission requests, answered from the drawer and from the Needs-you queue;
- stop, the stint history and its dates;
- the handoff attention item and the review overlay;
- switching back to English.

Codex isn't covered: it showed "Internal error" in this environment, so it wasn't selectable. That is an environment issue, not a translation one. No clipping or overflow was seen. The tab title read "（1 个待处理事项）zh-check-repo · Stintwork".

Fixed by Codex in this ticket:
1. Raw ACP update and tool kinds in the stream ("available commands update", "execute", "edit", …) now have catalog labels.
2. Drawer ticket statuses are now translated as in the gate.
3. The palette's "Suggestions" accessible name is now translated.
4. Chinese spacing: CJK text is now spaced from Latin, digits and code (`joinChinese`). Two follow-up rounds fixed an overcorrection that had spaced CJK from CJK and dropped the space before `/to-tickets`.
5. Setup's skill section now translates built-in workflow and stage names.

M6 · Chinese UI was added to `docs/plan.md` and `.stintwork/roadmap.md`. Coordinator checks in the worktree: `pnpm test` passed (127 files, 1826 tests), and `typecheck`, `lint` and `format:check` passed.

Left for follow-ups:
- Chinese-only titles: ticket 07.
- Sentences written by core and server (gate reasons, "This ticket is resolved.", agent warnings and status, stream notes): ticket 08, by the developer's decision.

Still open: the native-speaker review of the Chinese catalog. That is the only unchecked criterion, so this ticket stays open until the developer has done it.
