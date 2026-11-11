<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Docked work item detail

Status: ready-for-agent
Blocked by: 04

## What to build

Replace the drawer with a docked work item detail panel at 1024px and wider and a Sheet below 1024px. Use an identity card, property rows including the per-stage agent select, gate checklist with segmented progress, last handoff, stint history and sticky footer with one primary action. Keep every existing drawer behaviour and test, including actions, loading and error states, focus and dismissal.

Scope: Work item detail and its responsive container and tests.

## Acceptance criteria

- [ ] All existing drawer behaviours and tests remain covered; per-stage agent selection and every existing action work.
- [ ] At 1024 and 1440px detail is docked; at 768 and 390px it is a Sheet with correct focus and dismissal.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
