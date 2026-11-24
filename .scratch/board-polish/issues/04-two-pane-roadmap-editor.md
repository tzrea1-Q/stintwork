<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Two-pane roadmap editor

Status: resolved
Blocked by: none

## What to build

Rebuild the Edit roadmap Dialog as two panes, keeping its entry point and every existing roadmap action.

- **Left:** Add milestone at the top, then the milestone list with name, id, status chip and progress. Reorder by keyboard and pointer. Selecting a milestone shows it on the right.
- **Right:** name and target date as inline fields and status as a segmented control. Below, the milestone's work items, each with a Move to milestone control. One Save button writes the milestone's pending changes as one commit to `.stintwork/roadmap.md`; Cancel discards them. Switching milestones or closing with pending changes asks for confirmation.
- Progress counts shipped work items with the `workItemDone` derivation Overview and the milestone filter already use, so a shipped milestone whose items are shipped shows them as done.
- Widen the Dialog to about 960px within the 16px viewport gutter. Below 768px the panes stack and the milestone list becomes a select.
- Replace per-field button labels such as "Set status for M15 · Visual fidelity" with short visible labels; keep the milestone name in accessible names.

If one commit per Save needs a new core roadmap edit that batches changes, add it in `roadmap-editing` with tests; keep the existing hand-edit protection.

Scope: `RoadmapEditor.tsx`, `roadmap-editing` in core if needed, the server route if needed, i18n catalogs and tests.

## Acceptance criteria

- [x] With this repository's 15 milestones at 1440x900 the list and the selected milestone are visible without scrolling the Dialog.
- [x] Rename, status, target, reorder, add and move each work by keyboard and pointer; one Save creates one commit.
- [x] Pending changes are discarded only after the developer confirms, when switching milestones or closing.
- [x] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [x] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments

**Coordinator, 2026-11-23:** Verification.

- Codex implemented it with a batched core edit (`kind: "batch"`, one commit per Save). Review asked for a clear segmented status, the shared progress styling, Save-based intro copy and a compact New milestone button. The full suites then required unit and e2e selector updates for the new controls.
- Real browser on this repository's 16 milestones: at 1440x900 the list and the selected milestone fit without scrolling the dialog. At 390px zh-CN the reorder buttons overflowed the content box and work item titles truncated; both fixed, with an e2e case at 390 and 360px.
- Final runs on the integration branch: `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed. `pnpm test`: 3,462 passed; two server tests (`stint-permissions` twenty immediate answers, `work-item-files` watcher reindex) failed only under machine load and pass when rerun alone. `index.test.ts` "watching discovers project directories that do not exist at startup" also fails alone on `main`, so it is pre-existing and not caused by this milestone. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 508 passed before the last two fixes; after them `e2e/board.spec.ts` (54) and `e2e/dialogs.spec.ts` (140) passed in full.
