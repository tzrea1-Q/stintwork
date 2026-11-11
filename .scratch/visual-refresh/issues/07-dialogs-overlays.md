<!-- SPDX-License-Identifier: Apache-2.0 -->
# 07 — Dialogs and overlays

Status: resolved
Blocked by: 02

## What to build

Restyle brief preview, create work item, customise workflow, roadmap editor, setup, review overlay, gate view, permission and handoff answers, command palette and action-result toasts. Use structured property rows where appropriate and shared components. Keep entry points, actions, pending-save guards, nested dismissal and focus return. Toasts report action results; no Undo is offered today because no action can be reversed.

Scope: Existing dialogs, overlays, toasts and their behaviour tests; do not move entry points.

## Acceptance criteria

- [x] All named surfaces retain their existing actions, accessible names, keyboard use, focus and dismissal; pending saves and nested overlays remain protected.
- [x] Action results have toasts and no misleading Undo.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Verification.

- Done in three passes (toasts and gate/handoff; brief preview, create, customise, roadmap, setup; review, checks, ship, permission, memory, recovery, stop, risky paths, checkpoint warnings). The Toaster is mounted in `main.tsx` for action results; no Undo. Behaviour the code does not have (agent select in customise, a roadmap footer Save, setup row actions) was not added.
- Browser runs found the recovery status chip pushed out of view at 360px by a card-sized Stop stint control, and an unmarked truncated recovery fact; Stop stint is a compact inline control again and facts wrap.
- `codex review --base main` found a P1: the restyle swapped the review freshness input to `diff?.headCommit ?? item.headCommit`, which can show stale findings as current. Restored main's `item.headCommit ?? diff?.headCommit`, with a test. Gate kinds in the customise preview are localized.
- Review P2 "show the brief close tooltip on keyboard focus" is not adopted: the existing dismissal design focuses the close button on open (`dialogs.spec.ts:528`), so a focus tooltip makes the first Escape close only the tooltip (28 browser failures). The close button keeps its accessible name and hover tooltip.
- Final run on merged `main`: `pnpm format:check`, `pnpm lint` (existing 11 warnings), `pnpm typecheck`, `pnpm test` (3408 passed) and `pnpm build` pass. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` passed 418 of 432; the 14 remaining `dialogs.spec.ts:419` cases came from a later brief-preview tooltip change, which was reverted (see ticket 07), after which `dialogs`, `agent-preparation`, `board`, `top-bar` and `drawer-and-needs-you` specs pass (224 + 85 cases).
- Coordinator review of screenshots at 1440 and 390px in both languages and both schemes after the merge: accepted.
