<!-- SPDX-License-Identifier: Apache-2.0 -->
# 06 — Overview page

Status: resolved
Blocked by: 03

## What to build

Make Overview the home view. Show milestone progress, where work is by stage, one focal Next up card, Needs you, running stints and recent stint activity where existing project snapshot data provides them or they can be derived. Omit any card without data; never fake data or add core or server state. Link available actions to existing entry points and preserve their behaviour.

Scope: Overview view and tests using existing snapshot data only.

## Acceptance criteria

- [x] Available cards and actions reflect the snapshot; unavailable cards are omitted and empty, loading and error states are usable.
- [x] No new core or server state or invented activity is introduced.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Verification.

- Overview is the home view. With no `view` parameter the app opens Overview; `?item=` without `view` opens Pipeline with that item; `?view=pipeline` opens Pipeline. Opening an item from Overview switches to Pipeline and opens it there; back/forward restore both.
- Cards, all from the existing snapshot and omitted without data: Next up (focal card first: the first untouched item that has a ready ticket or no tickets, ranked by milestone status active, planned, none, shipped, then roadmap and snapshot order), Needs you (localized attention titles, opens the queue), running stints, milestone progress, where work is by stage, and recent stint activity. No core or server state was added.
- Milestone progress counts work items: an item is done when merged, or when its tickets are known, fresh, non-empty and all resolved. Rows with unknown or stale GitHub tickets say progress may be incomplete. Shipped milestones collapse into one disclosure row. The first version counted only `merged`, which local Markdown trackers never set, so this repository showed 0/1 for every shipped milestone; found in the coordinator's real-data review and fixed.
- Empty project: the shared Empty state with New work item (same condition as the board) and Pipeline, plus any project-level attention such as an agent login.
- Codex review findings fixed: empty-state attention hidden, English attention titles in zh-CN, a stale elapsed clock, Next up rejecting items with one ready and one blocked ticket, mixed progress units, unknown GitHub tickets counted as complete, and unwrapped long metadata.
- Also fixed here: a defect already on `main` from 04's polish, where slim empty columns clipped "Implement" without a truncation marker (31 layout failures). Slim columns are now 64px with one-line labels, `data-truncate` and `title`.
- Coordinator browser review with real data at 1440px (en) and 390px (zh-CN): accepted after the design pass (Next up first, compact milestone rows, cards at content height, status in the header row).
- Final run: see ticket 05 (same integration branch, 444f570): 3438 unit tests and 446 Playwright cases passed, including `e2e/overview.spec.ts` at every required width, language and scheme.
