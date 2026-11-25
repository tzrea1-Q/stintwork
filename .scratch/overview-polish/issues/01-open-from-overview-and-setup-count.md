<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Open work items from Overview, and one setup count

Status: ready-for-agent
Blocked by: none

## What to build

Fix spec findings A1 and A2.

- **A1.** Every way of opening a work item while Overview is showing (Jump to, a work item link in the Needs you queue, and any other caller of `openWorkItem`) switches to Pipeline and opens the work item, exactly as Overview's own rows do. Opening from Pipeline is unchanged. Focus moves into the detail as it does today.
- **A2.** The Settings menu's "Project setup x/y" and its warning dot come from the same checks as Project setup (`/api/setup`). If the snapshot does not carry them, add them to the snapshot on the server; never count a second list in the client.

Scope: `Board.tsx`, `TopBar.tsx`, the server and core code that build the snapshot's setup data if needed, and their tests.

## Acceptance criteria

- [ ] On Overview, choosing a work item in Jump to shows Pipeline with that work item's detail open (docked at 1024px and wider, Sheet below). The URL is `?view=pipeline&item=<slug>`.
- [ ] On Overview, a work item link in Needs you does the same and the queue closes.
- [ ] Switching from Overview to Pipeline never opens a detail the user did not ask for.
- [ ] With this repository's setup, the Settings menu and Project setup show the same count; a fixture where one check needs a change shows the dot and the same count in both.
- [ ] jsdom tests cover both paths of A1 and the shared count. `pnpm test` passes.

## Comments
