# 04 — Chinese drawer and stints

Status: resolved
Blocked by: 01

## What to build

Make the work item drawer and everything about running a stint readable in Chinese (spec user stories 13, 14 and 18–21).

- **Screens to translate:** move their English literals into the `en` catalog unchanged and add `zh-CN` entries:
  - the drawer's tabs, section headings, buttons and empty states;
  - the stage agent rail;
  - the permission level names (Ask, Edit freely, Autonomous) and their explanations, in the glossary's renderings;
  - the brief preview's chrome;
  - start, stop and resume controls, and stop-stint confirmations;
  - checkpoint warnings;
  - the stint stream's own labels (tool call, plan, file edit, status, ended, interrupted);
  - stint history.
- **Dates:** format times and dates with `Intl` in the current language, replacing hand-built English strings.
- **Verbatim content:** spec and ticket text, brief contents, agent messages, tool calls and output, and handoff text stay verbatim.

## Acceptance criteria

- [x] Component tests in Chinese:
  - drawer tabs and stint controls are findable by Chinese accessible names;
  - permission level names use the glossary's terms;
  - agent output, including non-ASCII, and ticket titles render verbatim;
  - a stint history date is formatted for `zh-CN`.
- [x] Existing English tests pass unchanged, and the catalog completeness test passes.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex. All four branches were merged into main. The shared catalog conflicts were resolved by keeping every section, and checking that no line from main was lost. On main after the last merge: `pnpm test` passed (127 files, 1761 tests), and `typecheck`, `lint` and `format:check` passed. A browser check on Stintwork's own repo in `zh-CN` passed. The drawer's tabs, stage rail, gate heading and footer were in Chinese. Codex's first run broke 3 of ticket 01's assertions, which had encoded the then-English drawer label. On resume Codex updated only those expectations. Gate readiness sentences come from core and stay English (for example "Every ticket must be resolved before approving."); see ticket 06.
