# 01 — Shared components, tokens and browser harness

Status: ready-for-agent
Blocked by: none

## What to build

Build ADR 0010's foundations following `docs/agents/frontend.md`. Ask the coordinator to install Radix primitives as needed, class-variance-authority, clsx and tailwind-merge, with `@playwright/test` as a development dependency. The agent sandbox has no network. Keep native modules out of the shipped package.

Move the CSS-variable tokens from `packages/web/src/style.css` to `packages/web/src/styles/tokens.css`. Add radius, spacing, type scale and shadow tokens and map them into Tailwind's theme. Keep both colour schemes through `prefers-color-scheme`. Replace the Google Fonts import with the system font stack.

Add a `cn` helper using clsx and tailwind-merge. Create Button, DropdownMenu, Popover, Dialog, Sheet and Tooltip in `packages/web/src/ui/` using Radix where applicable, Tailwind and class-variance-authority. Radix owns overlay interaction; Sheet shares the Dialog primitive. Each component has a behaviour test.

Create the Playwright harness under `packages/web/e2e/`: a repeatable fixture project, server start and teardown, and a shared layout-check helper. It checks horizontal page overflow, overlays against a 16px viewport gutter and accidentally clipped text. Deliberate truncation must expose full text; scrollable code and diffs stay contained. Add a board spec at all four widths in both languages.

Define `test:e2e` in the web package and a root forwarding script so `pnpm test:e2e` runs the suite. Wire it into CI alongside existing checks. CI downloads its Playwright browser; local runs may use the installed Chrome channel. Save screenshots as artifacts, including on failure, without pixel comparisons.

## Acceptance criteria

- [ ] Comments record the coordinator's package installation; dependencies and lockfile agree, with no native modules added to the shipped package.
- [ ] Tokens, including fonts and both colour schemes, have one source in `styles/tokens.css` and map into Tailwind's theme. The UI makes no remote font request.
- [ ] All six shared components and `cn` exist in `src/ui/`. Their behaviour tests cover semantics, accessible names, keyboard use, dismissal and focus return where applicable.
- [ ] The harness starts and cleans up a fixture project and server without real agent logins or private data. Its helper fails on overflow, out-of-bounds overlays and accidental text clipping.
- [ ] The board spec passes at 1440, 1024, 768 and 390px in `en` and `zh-CN`; the layout supports a minimum width of 360px. Any board layout fixes stay within this ticket's harness coverage.
- [ ] `pnpm test:e2e` runs from the repo root. CI installs the browser, runs the suite and uploads screenshots for review without pixel comparisons.
- [ ] Comments record actual behaviour and browser checks plus the coordinator's real-browser review at 1440 and 390px in both languages.

## Comments
