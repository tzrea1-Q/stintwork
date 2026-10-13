# 01 — Language switcher with a Chinese top bar and board

Status: ready-for-agent
Blocked by: none

## What to build

The tracer bullet for the spec (user stories 1–12, 33, 34, 36–46). A developer can open Stintwork in Simplified Chinese and switch between English and 简体中文 from the top bar. This ticket builds the whole language path and translates the first screens a developer sees.

- **Language module:** add it to the web app with an `en` catalog (the source of truth for keys) and a `zh-CN` catalog whose type is derived from it. Entries that take values are typed functions. Add a provider at the app root that exposes the current language, a setter and `t` through a hook.
- **Detection and storage:** a stored choice wins. Otherwise any `navigator.languages` entry with primary subtag `zh` chooses `zh-CN`, and anything else chooses `en`. The choice is stored in `localStorage` under a `stintwork.`-prefixed key, with reads and writes guarded. It never goes into repo files.
- **Page language:** `document.documentElement.lang` follows the current language.
- **Switcher:** a top-bar control labelled in the current language, whose options are each labelled in their own language. Switching re-renders without a reload and keeps open drawers and dialogs.
- **Glossary:** add a "Chinese terms" table to `GLOSSARY.md`, starting from the spec's proposed set. Justify any change in Comments.
- **Typography:** add CJK font fallbacks without changing Latin rendering.
- **Screens to translate, moving their English literals into the catalog unchanged:**
  - the connection screen;
  - the top bar: Needs-you button, Jump to…, milestone filter, the warnings and setup popovers' chrome, and the setup checklist labels;
  - the board's own chrome on columns and cards.
- **Built-in stage and workflow names:** shown from the catalog by workflow and stage id when the workflow is an uncustomised built-in. Otherwise they are shown verbatim from the YAML.
- **Verbatim content:** repo content (titles, paths, branches, milestone names, core warning messages) is never passed through `t`.

## Acceptance criteria

- [ ] Component tests:
  - detection (`zh-CN`, `zh-TW` and `zh` give Chinese; `fr` and `en-GB` give English);
  - a stored choice overrides detection;
  - blocked storage still renders;
  - switching updates the text and `lang` attribute and keeps an open drawer;
  - in Chinese, built-in stage headings are Chinese while a customised workflow's stage names and repo titles stay verbatim.
- [ ] A catalog completeness test: every `en` key exists in `zh-CN`, and no Chinese entry is empty or identical to English outside an explicit allowlist (product and agent names, "Stint", "Agent").
- [ ] Existing English tests pass unchanged.
- [ ] No new runtime dependency.
- [ ] All checks pass.
