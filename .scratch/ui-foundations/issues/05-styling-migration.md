# 05 — Feature styling and controls use the foundations

Status: ready-for-agent
Blocked by: 02, 03, 04

## What to build

Migrate feature CSS to Tailwind utilities and the mapped tokens, following `docs/agents/frontend.md`. Remove dead CSS and imports after each migration. Keep feature CSS only for rules utilities cannot express, with the reason recorded beside the rule. Both colour schemes come from the token file, including colours, radius, spacing, type scale and shadows.

Use ticket 02's language menu in the work-item drawer, then remove the unused native LanguageSelect. Preserve language detection, persistence and drawer state when changing language. Finish any remaining native selects or bespoke menus, popovers, dialogs, sheets and tooltips with `src/ui/` components. Add a missing wrapper with its own behaviour test before using it.

Keep existing product actions and all four view states intact. Run the browser specs from 01–04 after migration, including both colour schemes at 1440 and 390px. Complete screen coverage follows in 06.

## Acceptance criteria

- [ ] Feature styles use Tailwind theme classes backed by `styles/tokens.css`. Dead CSS and imports are removed; each retained feature CSS rule has a recorded utilities limitation.
- [ ] Existing menus, popovers, dialogs, sheets, tooltips and selects use `src/ui/` components. Any added wrapper has its own behaviour test.
- [ ] The drawer shares the top-bar language menu and the unused LanguageSelect is removed. Tests cover keyboard selection, focus return, persistence and retained drawer state in both languages.
- [ ] Existing browser specs pass at 1440, 1024, 768 and 390px in `en` and `zh-CN`; light and dark also pass at 1440 and 390px in both languages. Layout supports 360px.
- [ ] Those cases have no horizontal page scroll, accidental clipping or overlay gutter violations. Truncated names expose their full text.
- [ ] Screenshots are saved. Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages and both colour schemes.

## Comments
