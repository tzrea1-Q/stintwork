# UI foundations

Status: ready-for-agent

Milestone: M8 · UI foundations. See `docs/plan.md`, `docs/brief.md` (§10–§11), `GLOSSARY.md`, ADR 0006, ADR 0007, ADR 0010 and `docs/agents/frontend.md`.

## Problem Statement

The brief chose Tailwind and Radix primitives, but the web UI never adopted Radix. Overlays repeat focus, Escape and outside-click handling. At about 860px, the top bar wraps and its language, Warnings and Setup panels can be clipped beyond the left edge. The language switcher is a native two-row select inside a 360px panel.

Feature CSS defines most styling. CSS-variable tokens exist in `style.css` but are not mapped into Tailwind. The Inter import requests a remote Google Fonts stylesheet from a local-first tool and is unreachable in mainland China. All web tests use jsdom, so wrapping, clipping and overflow have no browser check. Agents have no shared frontend guide.

## Solution

Build the foundations in ADR 0010, migrate the existing screens, and check them in a real browser for release readiness.

- **Shared controls:** Radix primitives wrapped once in `packages/web/src/ui/`, with behaviour tests and Tailwind styles.
- **Shared styling:** CSS-variable tokens in `packages/web/src/styles/tokens.css`, mapped into Tailwind's theme for both colour schemes. System fonts replace remote font loading.
- **Existing screens:** migrate the top bar, work-item drawer, Needs you, dialogs and feature CSS without changing their product behaviour.
- **Browser evidence:** Playwright checks every screen at 1440, 1024, 768 and 390px in `en` and `zh-CN`, with a minimum supported width of 360px. Screenshots are saved for review.
- **Ongoing guide:** every change under `packages/web/` follows `docs/agents/frontend.md`.

## User Stories

1. As a developer, I want every screen to fit my window, so that actions and text stay reachable.
2. As a Chinese-speaking developer, I want the same usable layout in Chinese, so that changing language does not hide controls.
3. As a keyboard user, I want consistent focus and dismissal, so that I can use menus and overlays without a mouse.
4. As a developer, I want the local UI to use system fonts, so that it works without a remote font service.
5. As a coding agent, I want shared components and a frontend guide, so that each web change follows the same patterns.
6. As the maintainer, I want browser evidence before merging, so that layout bugs are found before the public release.

## Implementation Decisions

- **Stack:** follow ADR 0010 and `packages/web/package.json`. Add Radix primitives as needed, class-variance-authority, clsx and tailwind-merge; add `@playwright/test` for development. The coordinator installs packages because the agent sandbox has no network.
- **Components:** ticket 01 creates Button, DropdownMenu, Popover, Dialog, Sheet and Tooltip plus `cn`. Ticket 02 adds Select with its own behaviour test. Missing controls follow the same wrapped-primitive pattern. Radix owns positioning, focus, Escape and outside clicks.
- **Tokens:** ticket 01 moves the existing tokens to `packages/web/src/styles/tokens.css`, fills in radius, spacing, type scale and shadows, and maps them into Tailwind's theme. The system font stack and both colour schemes live there. Utilities style components; feature CSS remains only where utilities cannot express the rule.
- **Migration order:** 02 moves the top bar, 03 the sheets, and 04 the dialogs after 01. Ticket 05 depends on all three and finishes styling, remaining controls and drawer language-menu reuse. Ticket 06 covers every screen and fixes the layout bugs it finds.
- **Layout:** no horizontal page scroll at the supported widths. Toolbars wrap or collapse deliberately. Overlays have a 16px viewport gutter and scroll internally as needed. Long names expose their full text by title or tooltip; English and Chinese containers do not assume fixed text widths.
- **Behaviour and copy:** preserve existing actions, state, language detection and the saved `stintwork.language` choice. Strings come from both catalogs, with glossary terms and `coreText` for core and server text. Views continue to read state and send actions through the existing layer (ADR 0006).
- **Browser harness:** ticket 01 creates `packages/web/e2e/` with a repeatable fixture project, server start and layout-check helper. The root `pnpm test:e2e` forwards to the web package's script. CI downloads the Playwright browser; local runs may use the installed Chrome channel. Browser tests need no real agent login or private project.
- **Release boundary:** M8 finishes for release readiness while M7 stays active for repo preparation. After the human walk-through, development continues with M9 · Fast first run. The outside-developer test and fixes follow the public release, outside v0.2; neither gates development.

## Testing Decisions

- **Behaviour:** jsdom and Testing Library keep covering actions. Shared components test accessible names, keyboard use, visible focus hooks, Escape, outside-click dismissal and focus return where applicable. Nested overlays close only the topmost layer; pending-save guards still work.
- **Layout:** the helper asserts no horizontal page overflow, overlays inside the viewport with 16px gutters, and no accidentally clipped text. Deliberate truncation must expose full text. Diff and code scrolling stay local to their containers.
- **Coverage:** board, drawer, Needs you, gate, review, ship, setup, create, roadmap and customise run at 1440, 1024, 768 and 390px in both languages. Include the command palette and brief preview. Both colour schemes run at 1440 and 390px. Check loading, empty, error and long content where each screen can show them.
- **Evidence:** save screenshots as CI artifacts for review, not pixel comparisons. Each UI ticket names its widths and languages. The coordinator checks changed screens at 1440 and 390px in both languages before merging.
- **Checks:** run existing formatting, lint, typecheck and web behaviour checks, plus `pnpm test:e2e`. Record actual results in ticket Comments. Browser checks run in CI alongside the existing checks.
- **M8 exit:** CI's browser suite passes at all four widths in both languages. The maintainer walks every screen at 1440, 768 and 390px in both languages and finds no layout bugs. Ticket 07 records both results before setting M8 shipped.

## Out of Scope

- New views, workflows or product actions; Lists and Cockpit stay later.
- Core or server behaviour changes, agent integration and stint resume.
- Remote fonts, native modules in the shipped package, the shadcn CLI or pixel-by-pixel screenshot comparisons.
- Running the outside-developer test or fixing its findings; both follow the public release.
- Setting M8 shipped before its exit test passes.

## Further Notes

- The coordinator's 2026-10-13 analysis and the maintainer's request set this milestone's scope. The 2026-10-17 decision keeps the exit test unchanged and makes release readiness the reason for it.
- The stopped language-menu draft is folded into ticket 02. Drawer reuse follows in 05; no ticket is added to ui-language.
- Ticket dependencies are within this work item. M8 no longer gates go-public 04.
