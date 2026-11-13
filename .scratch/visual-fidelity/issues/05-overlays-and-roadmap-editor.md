<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Overlays and compact roadmap editor

Status: resolved
Blocked by: 01

## What to build

Restyle the Needs you list, command palette and dialogs to Variant D's density and type scale.

Turn Edit roadmap into compact milestone rows (name, status chip, target, progress). Each row expands to edit name, status and target, and reorder stays available. This replaces the full form per milestone, which is one long page with this repository's 14 milestones.

Keep every entry point, action, focus and dismissal behaviour.

Scope: overlay components, `RoadmapEditor` and their tests.

## Acceptance criteria

- [ ] With 14 milestones, Edit roadmap fits the collapsed list in about one screen at 1440x900; every edit and reorder still works by keyboard and pointer.
- [ ] The Needs you list and command palette match D at 1440 and 390px.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.

## Comments

**Coordinator, 2026-11-12:** Verification.

- The Needs you list, command palette and dialogs use D's density, icon chips and shared type scale.
- Edit roadmap shows compact milestone rows: name, id, status chip, target, a proportional progress bar and done/total. Each row expands (aria-expanded) to edit name, status and target. Reorder uses icon buttons with the shared tooltip.
- With this repository's 15 milestones, all collapsed rows fit on one screen at 1440x900. A new 14-milestone e2e case checks the fit at 1440px.
- Codex review caught two problems, now fixed. Segmented progress could clip on narrow screens and look complete; it is now proportional with a text count. The reorder buttons had only native titles; they now use the shared tooltip.
- One run looked like a roadmap regression, but it had tested a stale build: the check script skipped `pnpm build` after a unit failure. The script now always builds, and the rerun passed.
- Side-by-side with Variant D in a real browser at 1440 and 390px, en and zh-CN, on this repository's data and the rich fixture (the rich cases' full-page screenshots come from the e2e run).
- Final run on `main` at 96d6e7e (tickets 02–05 plus two polish passes merged): `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3462 passed) and `pnpm build` passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 506 passed.
- Earlier per-branch runs had isolated `ECONNRESET` on the e2e API request and server timing failures while four suites and Codex runs shared the machine. The unit suite and the e2e suite, each rerun alone on `main`, passed in full.
