# 02 — Viewport-safe top bar and language menu

Status: ready-for-agent
Blocked by: 01

## What to build

Migrate `TopBar.tsx` following `docs/agents/frontend.md`. Replace the two-row language select and 360px panel with a compact DropdownMenu beneath its own current-language trigger. Use the catalog's accessible label. English (`lang="en"`) and 简体中文 (`lang="zh-CN"`) are radio items in a menu, with a check and `aria-checked` for the current language.

Focus the current item on opening. Arrow up/down navigate. Selection changes language, closes the menu and returns focus to the trigger. Escape and outside clicks dismiss through Radix. Preserve browser-language detection and the saved `stintwork.language` choice. Keep the language-menu control reusable for the drawer in ticket 05.

Use Popover for Warnings and Setup, each anchored to its own trigger with collision handling and 16px viewport gutters. Preserve their content and actions. Add Select to `src/ui/` using the same Radix, Tailwind and class-variance-authority pattern, with its own behaviour test, and use it for the milestone filter. Preserve the All option and selected milestone.

Make top-bar wrapping or collapse deliberate at 768 and 390px. Add a top-bar browser spec at the standard widths in both languages, plus the stopped draft's 1330 and 860px regression cases. Check 360px as the minimum. Include long project, branch and milestone names and populated Warnings and Setup panels.

## Acceptance criteria

- [ ] Testing Library covers opening, current-item focus, arrow navigation, radio semantics and `aria-checked`, selection, Escape, outside clicks, focus return and persistence; select-based language tests are updated.
- [ ] No native language select remains in the top bar. The current-language trigger and menu are reusable without resetting other view state on a language change.
- [ ] Warnings and Setup use shared Popovers and retain their content and actions. The milestone filter uses the shared Select with a behaviour test.
- [ ] The top-bar spec passes at 1440, 1024, 768 and 390px in `en` and `zh-CN`, with deliberate wrapping or collapse at 768 and 390px and full text available for truncated names.
- [ ] Language, Warnings and Setup stay within 16px viewport gutters in both languages at those widths and at 1330, 860 and 360px. The page has no horizontal scroll.
- [ ] Screenshots are saved. Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages.

## Comments
