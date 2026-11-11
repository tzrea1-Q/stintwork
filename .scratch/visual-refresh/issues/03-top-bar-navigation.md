<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Top bar and navigation

Status: ready-for-agent
Blocked by: 02

## What to build

Replace the top bar with project and branch, centred pill navigation between Overview and Pipeline, Jump to (⌘K), Needs you and Settings; no sidebar. Put the current view in the URL. Preserve all ui-foundations 09 rules: Settings language radio and persistence, Project setup count and warning dot, focus return, responsive labels and tooltips; Needs you counts attention items and shows project warnings separately, including empty states and accessible warning descriptions. Preserve shortcuts, palette destinations and milestone commands.

Scope: Top bar, view navigation, URL and related tests; keep existing actions and entry points.

## Acceptance criteria

- [ ] Navigation and URL restore the current view; controls and their existing keyboard, warning, language, setup and focus behaviours remain available.
- [ ] The bar fits without wrapping at 768 and 390px; long names expose their full text.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
