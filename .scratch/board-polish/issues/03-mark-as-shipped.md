<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Mark as shipped

Status: resolved
Blocked by: none

## What to build

Let the developer record a merge made outside Stintwork (ADR 0021).

- **Core:** extend `MergeRecord` with optional `outside: true`; parse and write it in the workflow file. A work item with any merge record is Shipped, as today.
- **Server:** an action that takes a work item and a commit. Refuse when the work item is GitHub-tracked, already has a merge record, has a running stint, or has a Stintwork worktree, and when the commit does not exist or is not reachable from the main checkout's branch. Otherwise write `merged: { at, commit, outside: true }` to the work item's workflow file and commit it the way gate writes are committed. Return coded errors rendered through `coreText`.
- **Web:** a secondary "Mark as shipped" action in work item detail, shown only when available. It opens a Dialog that explains the effect, takes the merge commit prefilled with the main checkout's `HEAD`, and confirms. On success a toast reports the result and the item moves to the Shipped lane. Detail of a shipped item shows "Merged outside Stintwork" with the short commit.

Scope: `packages/core` stages and core text, the server action and route, the detail action and Dialog, i18n catalogs and tests.

## Acceptance criteria

- [x] Core and server tests cover the write, the commit, each refusal and an unreachable commit.
- [x] Behaviour tests cover the Dialog by keyboard, validation errors, cancel with focus return, and success.
- [x] Marking `board` in a copy of this repository moves it to the Shipped lane, updates "active · shipped" counts and creates one commit touching only `.scratch/board/workflow.yaml`.
- [x] Strings exist in `en` and `zh-CN`; the browser suite passes at 1440 and 390px in both languages.
- [x] Comments record the real-repository check.

## Comments

**Coordinator, 2026-11-23:** Verification.

- Codex implemented it. Review asked to revert unrelated import reordering, to refuse while the work item has a Stintwork worktree (ADR 0021 updated) instead of projecting main's record over the worktree, to classify the new write route in `github-lifecycle.test.ts`, and to match other dialogs' styling.
- Real-repository check in a clone of `main`: Mark as shipped on `board` prefilled `HEAD`, produced one commit `Record outside merge of board` touching only `.scratch/board/workflow.yaml` (`merged.outside: true`), moved the item to the Shipped lane and changed the counts to 17 active · 1 shipped. Detail shows "Merged outside Stintwork · <short commit>".
- Dialog checked at 1440px en and 390px zh-CN.
- Final runs on the integration branch: `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed. `pnpm test`: 3,462 passed; two server tests (`stint-permissions` twenty immediate answers, `work-item-files` watcher reindex) failed only under machine load and pass when rerun alone. `index.test.ts` "watching discovers project directories that do not exist at startup" also fails alone on `main`, so it is pre-existing and not caused by this milestone. `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 508 passed before the last two fixes; after them `e2e/board.spec.ts` (54) and `e2e/dialogs.spec.ts` (140) passed in full.
