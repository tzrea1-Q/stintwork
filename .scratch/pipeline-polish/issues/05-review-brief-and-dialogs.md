<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Review overlay, Brief preview and Pipeline dialogs

Status: resolved
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

- [x] jsdom tests cover roadmap progress in ticket units, Brief preview Cancel, and the close buttons.
- [x] `e2e/dialogs.spec.ts` asserts:
  - the Customise footer does not overlap its content;
  - severity chips are no wider than their text plus padding;
  - no visible 40-character hash in the review header;

  each at 1440, 1024, 768, 390 and 360px in both languages.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-25:** Delivered by Codex, with a coordinator fix for the review overlay's read-only note clipping at 390px. Checked on real data and the dialog fixture: structured review header with short hashes, secondary Send back, Brief preview with Cancel and a warning callout, Edit roadmap progress in ticket units, close buttons on every dialog. Full checks on the merged branch: format, lint, typecheck and build pass; `pnpm test` has 3637 passing and one failure that already fails on `main` (`packages/server/src/index.test.ts`, "watching discovers project directories that do not exist at startup"), unrelated to this milestone. The full browser suite passes 555 of 556; the remaining case is `motion-board.spec.ts` "board snapshot continuity at 1440px", which saw long tasks of 58–59 ms only while three workers ran in parallel and passes run on its own (3 of 3).
