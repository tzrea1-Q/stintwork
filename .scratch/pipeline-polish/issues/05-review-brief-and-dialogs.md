<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Review overlay, Brief preview and Pipeline dialogs

Status: ready-for-agent
Blocked by: 01

## What to build

Fix spec findings A3 (Customise), A5, A6, A7 and D1–D4.

- Review overlay:
  - a structured header (title, branch → base, short head and merge-base hashes with copy, the read-only note as one muted line);
  - Send back as a secondary action beside Close;
  - file paths truncated in the middle with the full path in `title`;
  - the three filters in one compact row or a popover;
  - severity chips sized to their text;
  - a header that fits at 390px.
- Brief preview:
  - label, icon and picker on one row;
  - the preparation status inline with the agent rather than alone in a box;
  - the sandbox warning as `ui/WarningCallout`;
  - Cancel beside Start;
  - even card padding.
- Edit roadmap:
  - the close icon like other dialogs;
  - progress per milestone in ticket units through `overview-data.ts`, matching Overview;
  - a target date field styled like `ui/Input`.
- Customise workflow:
  - a footer that sits below the scrolling content, separated, never overlapping it;
  - agents by display name.
- Mark as shipped: a close button like other dialogs.

Scope: `ReviewOverlay.tsx`, `ReviewFindings.tsx`, `RiskyPaths.tsx`, `BriefPreview.tsx`, `RoadmapEditor.tsx`, `CustomiseWorkflow.tsx`, `MarkShipped.tsx`, both catalogs, `e2e/dialogs.spec.ts` and tests.

## Acceptance criteria

- [ ] jsdom tests cover roadmap progress in ticket units, Brief preview Cancel, and the close buttons.
- [ ] `e2e/dialogs.spec.ts` asserts:
  - the Customise footer does not overlap its content;
  - severity chips are no wider than their text plus padding;
  - no visible 40-character hash in the review header;

  each at 1440, 1024, 768, 390 and 360px in both languages.
- [ ] `pnpm test` passes.

## Comments
