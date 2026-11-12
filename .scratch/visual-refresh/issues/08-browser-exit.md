<!-- SPDX-License-Identifier: Apache-2.0 -->
# 08 — Browser suite and M14 exit

Status: resolved
Blocked by: 03, 04, 05, 06, 07

## What to build

Cover every screen and state in the browser suite, including Overview, Pipeline and detail, Needs you, command palette, brief preview and every dialog and overlay. Check long content, loading, empty and error states, intentional scroll containers, clipping and 16px overlay gutters. Save screenshots as review artifacts, not pixel comparisons. Fix findings and record actual checks in Comments.

The maintainer walks Overview, Pipeline with the detail panel, Needs you and every dialog at 1440, 768 and 390px in both languages and accepts the result before M14 exits.

Scope: Browser coverage, fixes required for acceptance, screenshots and maintainer exit evidence.

## Acceptance criteria

- [x] The browser suite passes at 1440, 1024, 768 and 390px in `en` and `zh-CN` in both light and dark; minimum supported width is 360px.
- [x] Comments record the maintainer acceptance walk at 1440, 768 and 390px in both languages and actual suite results.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-11:** Suite coverage, fixes and coordinator review. The maintainer walk is still to come.

- Audit: every screen already had browser checks at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px. These cover Pipeline (loading, error, empty, long content), the detail panel (docked at lg, Sheet below), Needs you, the command palette, the brief preview, create, roadmap, customise, review, findings, gate, ship, agent preparation, stint recovery and the top bar. Overview only covered a minimal populated page and the empty state.
- Added `Overview states` to `e2e/overview.spec.ts` (14 cases): loading, 503 error, full long content with every card (Next up, Needs you, running stints, milestones with the incomplete hint and shipped disclosure, stages, activity), opening Needs you, unavailable tickets on Next up, and milestone navigation into a filtered Pipeline. Screenshots: `overview-loading`, `overview-error`, `overview-full`, `overview-unavailable` under `packages/web/coverage/e2e/test-results`.
- Fixed from the coordinator's real-data review:
  - Edit roadmap and the Pipeline milestone filter still counted only merged work items, so every milestone in a local Markdown tracker showed empty progress. All three places now share `workItemDone` from `overview-data.ts`.
  - Rendered spec and ticket Markdown exposed its own `<h1>`s, so the detail panel showed ten top-level headings (pre-existing since ui-foundations 05). Markdown headings now render two levels lower (h1→h3 … capped at h6) and keep their source sizes. The first version used numeric attribute selectors that lightningcss flags as invalid; they now use `h1`…`h6` values and the build has no CSS warnings.
- Coordinator browser review with this repository's data: Overview, Pipeline with the docked detail, the command palette, Needs you and Edit roadmap at 1440px `en` (light and dark), 768px `en`, and Overview and the detail Sheet at 390px `zh-CN`. No horizontal overflow (`scrollWidth` equals the viewport). Observation for the maintainer walk: with 14 milestones, Edit roadmap is one long form, a full card per milestone.
- Main at a7a7d89 before this ticket: 446 Playwright cases passed.
- Final run on `visual-refresh/08`: `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3441 passed) and `pnpm build` (no CSS warnings) all passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 460 passed.

**Maintainer, 2026-11-11:** Accepted after the requested walk-through of `main` at bd21ded against this repository (brief: Overview, Pipeline with the detail panel, Needs you and every dialog at 1440, 768 and 390px in `en` and `zh-CN`). No changes requested. M14 exits.
