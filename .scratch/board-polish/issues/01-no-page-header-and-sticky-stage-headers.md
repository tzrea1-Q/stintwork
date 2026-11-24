<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — No page header and sticky stage headers

Status: ready-for-agent
Blocked by: none

## What to build

Remove the page header from Overview and Pipeline (ADR 0020): the breadcrumb, title, count and subtitle. Move Pipeline's active and shipped counts and the connection status into the board toolbar, and Overview's connection status to the top right of its first card row. Keep the connection error banner. Retire `src/ui/PageHeader` if nothing else uses it.

Make one element scroll the Pipeline board both vertically and horizontally, replacing the nested `.board-scroll` and `.stage-scroll` scrollers. Stage headers stick to its top with the card background, and a divider appears once cards scroll under them. Keep snap scrolling, the edge fade and stage navigation below 1200px, and the Shipped lane and unstaged items below the stages.

Scope: `Board.tsx`, `Overview.tsx`, `Column.tsx`, the i18n catalogs, their tests and the e2e layout checks.

## Acceptance criteria

- [ ] At 1440x900 the Pipeline toolbar sits directly below the top bar and the board starts about 140px higher than at `ccb64cc`.
- [ ] After scrolling the board 700px down, every stage header is still visible at the top of the board, at 1440, 1024, 768 and 390px.
- [ ] Horizontal stage scrolling below 1200px still works with pointer, keyboard and stage navigation.
- [ ] Counts and connection status remain visible and have accessible names in `en` and `zh-CN`.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include screenshots at 1440 and 390px in both languages on the e2e fixture and this repository's data.

## Comments
