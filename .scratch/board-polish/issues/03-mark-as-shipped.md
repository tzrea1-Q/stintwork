<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Mark as shipped

Status: ready-for-agent
Blocked by: none

## What to build

Let the developer record a merge made outside Stintwork (ADR 0021).

- **Core:** extend `MergeRecord` with optional `outside: true`; parse and write it in the workflow file. A work item with any merge record is Shipped, as today.
- **Server:** an action that takes a work item and a commit. Refuse when the work item is GitHub-tracked, already has a merge record, or has a running stint, and when the commit does not exist or is not reachable from the main checkout's branch. Otherwise write `merged: { at, commit, outside: true }` to the work item's workflow file and commit it the way gate writes are committed. Return coded errors rendered through `coreText`.
- **Web:** a secondary "Mark as shipped" action in work item detail, shown only when available. It opens a Dialog that explains the effect, takes the merge commit prefilled with the main checkout's `HEAD`, and confirms. On success a toast reports the result and the item moves to the Shipped lane. Detail of a shipped item shows "Merged outside Stintwork" with the short commit.

Scope: `packages/core` stages and core text, the server action and route, the detail action and Dialog, i18n catalogs and tests.

## Acceptance criteria

- [ ] Core and server tests cover the write, the commit, each refusal and an unreachable commit.
- [ ] Behaviour tests cover the Dialog by keyboard, validation errors, cancel with focus return, and success.
- [ ] Marking `board` in a copy of this repository moves it to the Shipped lane, updates "active · shipped" counts and creates one commit touching only `.scratch/board/workflow.yaml`.
- [ ] Strings exist in `en` and `zh-CN`; the browser suite passes at 1440 and 390px in both languages.
- [ ] Comments record the real-repository check.

## Comments
