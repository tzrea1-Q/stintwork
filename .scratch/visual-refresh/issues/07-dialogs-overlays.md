<!-- SPDX-License-Identifier: Apache-2.0 -->
# 07 — Dialogs and overlays

Status: ready-for-agent
Blocked by: 02

## What to build

Restyle brief preview, create work item, customise workflow, roadmap editor, setup, review overlay, gate view, permission and handoff answers, command palette and action-result toasts. Use structured property rows where appropriate and shared components. Keep entry points, actions, pending-save guards, nested dismissal and focus return. Toasts report action results; no Undo is offered today because no action can be reversed.

Scope: Existing dialogs, overlays, toasts and their behaviour tests; do not move entry points.

## Acceptance criteria

- [ ] All named surfaces retain their existing actions, accessible names, keyboard use, focus and dismissal; pending saves and nested overlays remain protected.
- [ ] Action results have toasts and no misleading Undo.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
