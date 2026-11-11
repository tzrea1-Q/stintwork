<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Pipeline board

Status: ready-for-agent
Blocked by: 02

## What to build

Rebuild Pipeline as a rounded board card. Give stage headers an icon chip, count and one-line stat; use state-tinted work item cards, slim empty columns and a collapsed Shipped row. Put milestone and workflow pickers and the primary New work item action in the page toolbar. Preserve filtering, URL/state, long-name access, existing actions and keyboard behaviour.

Scope: Pipeline board, toolbar and behaviour tests; detail panel belongs to 05.

## Acceptance criteria

- [ ] Board states, pickers, collapsed Shipped and New work item work with existing data and actions.
- [ ] Board scrolling remains contained, including narrow widths; long labels remain accessible.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
