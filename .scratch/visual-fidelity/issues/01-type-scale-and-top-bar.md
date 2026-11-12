<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Type scale, shared patterns and top bar

Status: ready-for-agent
Blocked by: none

## What to build

Add Variant D's type hierarchy to the shared patterns in `packages/web/src/ui/` and apply it app-wide:
- page titles 39px (34px below 768px) with -0.055em tracking
- an uppercase eyebrow label above card titles
- card titles 13px/620
- tabular numerals for counts

Rebuild the top bar to D: logo mark and bold wordmark, project and branch in one pill, and Needs you with a count badge. Keep every existing top-bar behaviour (language, warnings, setup, Jump to, shortcuts, focus).

Add the rich e2e fixture state from the spec's Testing Decisions, for use by every later ticket.

Scope: shared typography patterns, page headers, the top bar and the rich fixture. Screen-specific layouts belong to later tickets.

## Acceptance criteria

- [ ] Page titles, eyebrows, card titles and counts use the shared patterns everywhere; no screen sets its own title size.
- [ ] The top bar matches D at 1440 and 390px and keeps all existing behaviour and tests.
- [ ] The rich fixture state exists and is used by at least the board and Overview specs.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.
