<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Overlays and compact roadmap editor

Status: ready-for-agent
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
