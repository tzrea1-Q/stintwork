<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Two-pane roadmap editor

Status: ready-for-agent
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

- [ ] With this repository's 15 milestones at 1440x900 the list and the selected milestone are visible without scrolling the Dialog.
- [ ] Rename, status, target, reorder, add and move each work by keyboard and pointer; one Save creates one commit.
- [ ] Pending changes are discarded only after the developer confirms, when switching milestones or closing.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments
