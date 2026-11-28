<!-- SPDX-License-Identifier: Apache-2.0 -->
# 10 — Workflow picker label shows twice while closing

Status: resolved
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

- [x] A browser spec opens the workflow picker on Pipeline, closes it with Escape and again by choosing an option, and samples the trigger's text on every frame for 1 s. Every frame shows the selected label exactly once, in `en` and `zh-CN`. The spec fails on the current code.
- [x] A jsdom test covers the same with a childless `SelectValue` in `ui/Select.tsx`, or fails if a childless `SelectValue` is used.
- [x] The existing browser suite still passes.

## Comments

**Coordinator, 2026-11-28:** Implemented by Codex in two rounds.

- The workflow picker now passes its label as `SelectValue` children.
- `ui/Select.tsx` wraps `Primitive.Value` with required `children`. A childless use fails `pnpm typecheck`, which `Select.test.tsx` enforces with `@ts-expect-error`.
- Round 1's browser spec passed on the pre-fix build. It found the trigger with `getByRole`, which matches nothing while Radix hides everything outside the open listbox, so sampling started only after the close.
- Round 2 captures the trigger before opening the menu and requires at least 3 sampled frames with the listbox present.

Verification on a73cf74:

- `e2e/workflow-picker-label.spec.ts` fails on a pre-fix build in `en` and `zh-CN` and passes with the fix.
- `pnpm build`, `pnpm typecheck` and `pnpm format:check` pass. `pnpm lint` shows the same 13 warnings and 8 infos as before the change.
- `pnpm --dir packages/web test`: 1039 of 1040 passed under load. The full suite rerun passed 1040 of 1040.
- Full browser suite (4 workers): 565 of 568 passed. Three tests failed under parallel load and passed alone with `--workers=1` (104 of 104):
  - `motion-board` "board snapshot continuity at 1440px";
  - `motion-moments` "live moments at 390px";
  - one `agent-preparation` "keyboard dismissal and focus return" case.

