<!-- SPDX-License-Identifier: Apache-2.0 -->
# 10 — Workflow picker label shows twice while closing

Status: ready-for-agent
Blocked by: none

## What to build

On 2026-11-27 the maintainer found that closing the Pipeline workflow picker briefly shows its label twice ("全部工作流全部工作流").

**Cause, reproduced by the coordinator.** `BoardWorkflowFilter.tsx` renders `<SelectValue />` with no children, so Radix Select portals the selected item's `ItemText` into the trigger (`@radix-ui/react-select` 2.4.1, `dist/index.mjs` line 986). While `ui/Select.tsx` plays the exit animation, two `Primitive.Content` copies are mounted: the closed-state copy (`{!open && <Primitive.Content>…}`) and the exiting `forceMount` copy inside `AnimatePresence`. Each selected `ItemText` portals into the trigger. Sampling the trigger's `innerText` on every frame after Escape and after choosing an option at 1440px in `zh-CN`: 12 of 60 frames read "全部工作流全部工作流" and the rest read "全部工作流".

The milestone picker (`board/BoardToolbar.tsx`) and `ui/SelectField.tsx` pass the label as `SelectValue` children, which stops the portal, and do not show the bug.

Fix:

- The workflow picker passes its label as `SelectValue` children, with `data-truncate` and `title`, the same way as the milestone picker. The label is the selected workflow's `workflowName`, or `allWorkflows`.
- `ui/Select.tsx` must not let any Select show its value twice while it closes, including one whose `SelectValue` has no children. If the primitive can't guarantee that, remove the childless use and add a test that fails if a childless `SelectValue` is used again.

Scope: `BoardWorkflowFilter.tsx`, `ui/Select.tsx`, and tests. Keep the menu's open and exit motion (`spring.pop`, `tween.dismiss`) and the Radix Escape workaround as they are.

## Acceptance criteria

- [ ] A browser spec opens the workflow picker on Pipeline, closes it with Escape and again by choosing an option, and samples the trigger's text on every frame for 1 s. Every frame shows the selected label exactly once, in `en` and `zh-CN`. The spec fails on the current code.
- [ ] A jsdom test covers the same with a childless `SelectValue` in `ui/Select.tsx`, or fails if a childless `SelectValue` is used.
- [ ] The existing browser suite still passes.

## Comments
