<!-- SPDX-License-Identifier: Apache-2.0 -->
# Visual refresh

Status: ready-for-agent

Milestone: M14 · Visual refresh. See `docs/plan.md`, `GLOSSARY.md`, ADR 0006, ADR 0007, ADR 0010, ADR 0019 and `docs/agents/frontend.md`.

## Problem Statement

On 2026-11-10 the maintainer found the shipped web UI rough. Its 13px base and 11/12px small type give little hierarchy. The 4–8px radii and near-invisible shadows blur canvas, surfaces and cards. Empty stage columns are large dashed boxes. The drawer and dialogs pour raw text without label/value structure. A cramped stage-agent row truncates labels.

## Solution

Rebuild the visual language from Variant D of `prototype-visual-v1`, a design reference, not source to import. Use shadcn/ui with Radix and the tokens, fonts and layout in ADR 0019. Make Overview the home and keep Pipeline as the board. Preserve existing actions and state while restyling the detail and overlays.

## User Stories

1. As a developer, I want a clear Overview, so I can see progress and what needs me.
2. As a developer, I want a scannable Pipeline and structured detail, so I can understand and act on work.
3. As a keyboard user, I want predictable focus and dismissal across all surfaces.
4. As a Chinese-speaking developer, I want every action and label to remain usable at narrow widths.
5. As the maintainer, I want browser evidence and a walk-through before accepting the refresh.

## Implementation Decisions

- **Foundation:** ADR 0019 settles the shadcn CLI, Radix migration, `new-york` configuration, repo-owned components, existing `cn`, React 18, OKLCH tokens, bundled Geist fonts and system-selected `.dark` class. The coordinator installs packages; the agent sandbox has no network.
- **Visual language:** use the prototype's grey canvas, rounded white cards and soft shadows, near-black pill actions, violet selection and focus, tinted status chips, icon chips, property rows and segmented counts. Use 14px base, 28–32px titles and tabular count numerals. Dark is designed separately.
- **Navigation:** top bar has project and branch, centred Overview and Pipeline, Jump to, Needs you and Settings. Preserve ui-foundations 09's language, warnings, setup, shortcut and focus behaviour. Keep the current view in the URL. No sidebar.
- **Overview:** show milestone progress, work by stage, one focal Next up card, Needs you, running stints and recent activity only where existing project snapshot data supplies or derives them. Omit unavailable cards. Add no core or server state (ADR 0006).
- **Pipeline:** use a board card with stage headers, tinted work item cards, slim empty columns and collapsed Shipped row. Put milestone and workflow pickers and New work item in the toolbar. Dock detail at 1024px and wider; below that use Sheet. Preserve every drawer action and test.
- **Overlays:** keep roadmap editor, setup, customise, review, gate and brief preview entry points and behaviour. Restyle all dialogs and overlays. Toast action results; no Undo today because no action is reversible.
- **Order:** 01 foundation, 02 shared patterns, 03 navigation, 04 board, 05 detail, 06 Overview, 07 overlays, 08 browser suite and exit. Dependencies are in the tickets.

## Testing Decisions

- Keep jsdom behaviour tests for components and actions, including keyboard, focus, Escape, outside clicks and nested overlays. Radix owns overlay interaction.
- Playwright checks every screen at 1440, 1024, 768 and 390px in `en` and `zh-CN`, minimum width 360px, with both colour schemes at 1440 and 390px. Check overflow, 16px overlay gutters, clipping, loading, empty, error and long content. Save screenshots as review artifacts.
- M14 exit requires the browser suite at all four widths in both languages and both schemes. The maintainer walks Overview, Pipeline with detail, Needs you and every dialog at 1440, 768 and 390px in both languages and accepts the result. Record actual checks and review in ticket Comments.

## Out of Scope

- New core or server state, fake Overview data, and prototype Stints and Roadmap pages.
- Base UI, a theme switch, remote fonts, Undo for irreversible actions and importing prototype code.
- Moving existing roadmap, setup, customise, review, gate or brief preview entry points.

## Further Notes

The coordinator verified shadcn CLI init and add with React 18.3.1, Tailwind 4 and Vite 7 on 2026-11-10. Prototype CSS uses hex and RGB for many values; convert its values to OKLCH. ADR 0019 records the partial supersession of ADR 0010 and the rules that remain.
