<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Open work items from Overview, and one setup count

Status: resolved
Blocked by: none

## What to build

Fix spec findings A1 and A2.

- **A1.** Every way of opening a work item while Overview is showing (Jump to, a work item link in the Needs you queue, and any other caller of `openWorkItem`) switches to Pipeline and opens the work item, exactly as Overview's own rows do. Opening from Pipeline is unchanged. Focus moves into the detail as it does today.
- **A2.** The Settings menu's "Project setup x/y" and its warning dot come from the same checks as Project setup (`/api/setup`). If the snapshot does not carry them, add them to the snapshot on the server; never count a second list in the client.

Scope: `Board.tsx`, `TopBar.tsx`, the server and core code that build the snapshot's setup data if needed, and their tests.

## Acceptance criteria

- [x] On Overview, choosing a work item in Jump to shows Pipeline with that work item's detail open (docked at 1024px and wider, Sheet below). The URL is `?view=pipeline&item=<slug>`.
- [x] On Overview, a work item link in Needs you does the same and the queue closes.
- [x] Switching from Overview to Pipeline never opens a detail the user did not ask for.
- [x] With this repository's setup, the Settings menu and Project setup show the same count; a fixture where one check needs a change shows the dot and the same count in both.
- [x] jsdom tests cover both paths of A1 and the shared count. `pnpm test` passes.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it in two rounds; the second fixed `e2e/top-bar.spec.ts`, which still expected the old five-flag count "3/5" and failed in all 22 cases.
- `openWorkItem` now switches to Pipeline when Overview is showing, and every caller (Overview, Jump to, Needs you, cards) uses it. The snapshot carries `setup.checks` from `planSetup`, with the GitHub tracker check resolved on the server, and the top bar counts and warns from them.
- Real data (this repository, 1440px): Jump to on Overview opens `visual-fidelity` in the docked panel at `?view=pipeline&item=visual-fidelity`, focus in the panel. 390px: opens in the Sheet. Settings shows "Project setup 6/6", the same as Project setup.
- Unit suite on the integration branch: 3545 passed, 1 failed (`index.test.ts` "watching discovers project directories that do not exist at startup", pre-existing on main). Format, lint, typecheck and build pass.
- Browser suite on the integration branch: 518 passed; 22 `top-bar` cases fixed by round two (32/32 after); `agent-preparation` (3), `motion-board` (1) and `motion-moments` (1) failed under parallel load and pass alone with `--workers=1` (104/104).
- The running service on port 4317 was restarted on the new build, because the new client requires `setup.checks`.
