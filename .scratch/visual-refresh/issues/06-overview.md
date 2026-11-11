<!-- SPDX-License-Identifier: Apache-2.0 -->
# 06 — Overview page

Status: ready-for-agent
Blocked by: 03

## What to build

Make Overview the home view. Show milestone progress, where work is by stage, one focal Next up card, Needs you, running stints and recent stint activity where existing project snapshot data provides them or they can be derived. Omit any card without data; never fake data or add core or server state. Link available actions to existing entry points and preserve their behaviour.

Scope: Overview view and tests using existing snapshot data only.

## Acceptance criteria

- [ ] Available cards and actions reflect the snapshot; unavailable cards are omitted and empty, loading and error states are usable.
- [ ] No new core or server state or invented activity is introduced.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
