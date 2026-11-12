<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Type scale, shared patterns and top bar

Status: resolved
Blocked by: none

## What to build

Add Variant D's type hierarchy to the shared patterns in `packages/web/src/ui/` and apply it app-wide:
- page titles 39px (34px below 768px) with -0.055em tracking
- an uppercase eyebrow label above card titles
- dashboard card titles 16px with -0.025em tracking (work item card titles, 13px/620, belong to ticket 02)
- tabular numerals for counts

Rebuild the top bar to D: logo mark and bold wordmark, project and branch in one pill, and Needs you with a count badge. Keep every existing top-bar behaviour (language, warnings, setup, Jump to, shortcuts, focus).

Add the rich e2e fixture state from the spec's Testing Decisions, for use by every later ticket.

Scope: shared typography patterns, page headers, the top bar and the rich fixture. Screen-specific layouts belong to later tickets.

## Acceptance criteria

- [x] Page titles, eyebrows, card titles and counts use the shared patterns everywhere; no screen sets its own title size.
- [x] The top bar matches D at 1440 and 390px and keeps all existing behaviour and tests.
- [x] The rich fixture state exists and is used by at least the board and Overview specs.
- [x] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [x] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.

## Comments

**Coordinator, 2026-11-12:** Verification.

- Shared patterns in `packages/web/src/ui/`: `PageHeader` (eyebrow, 39px/34px title with -0.055em tracking, 13px context line, actions slot), one shared `Eyebrow`, and Card at Variant D's 22px radius, 23px padding and 1px border, with 16px card titles. The type sizes are tokens in `styles/tokens.css`. Overview and Pipeline use `PageHeader`.
- Overview card eyebrows name the category and titles stay specific (Workflow / Where the work is, Milestone progress / Roadmap, and so on). The first version repeated each title in its eyebrow; caught in the coordinator's review against D and fixed. The Next up card's heading is now the work item title.
- Top bar: logo mark, bold wordmark, a project pill with the branch, view pills, the search pill, Needs you with a count badge (hidden at 0) and Settings. All earlier behaviour and tests are kept. The branch stays visible at every width; the project name gets priority and both parts size to their content. Codex review caught the branch being hidden below 640px; the coordinator caught a zero flex-basis that truncated the branch at 1440px.
- The rich e2e fixture (`e2e/rich.fixture.ts`) has an active milestone with a target, running, waiting, blocked and stopped items, one Next up item, 7 days of stint history and a pinned clock. New rich Overview and board cases use it across the full matrix. Its first run caught Running now metadata clipped at 390 and 360px; that metadata now wraps.
- Rejected review finding: 13px card titles. Variant D's dashboard cards use 16px (`.b-card h2`); 13px/620 is the work item card title (`.work-card h3`), which belongs to ticket 02. The spec wording was corrected.
- Side-by-side with Variant D in a real browser, on this repository's data: 1440px en light and 390px zh-CN light and en dark. The top bar and heading structure match D, and no page scrolls horizontally. Overview's content (milestone percentage, charts, Next up hero) is still the M14 layout until ticket 04.
- Final run on `visual-fidelity/01`: `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3444 passed) and `pnpm build` passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 488 passed.

