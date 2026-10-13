# 03 — Chinese Needs-you queue

Status: resolved
Blocked by: 01

## What to build

Make the Needs-you queue and attention alerts readable in Chinese (spec user stories 15–17 and 35).

- **The queue's own text:** move the Needs-you queue's English literals into the `en` catalog unchanged and add `zh-CN` entries. This covers the heading, empty state, notification toggle, permission answers (allow, deny and the other choices), handoff answers and developer notes.
- **Attention items:** render each known attention item kind from its structured fields with catalog messages: permission request, unresolved handoff, stage ready for approval, agent needs a login and checkpoint warning. Fall back to core's English `title` for an unknown kind. Agent-supplied permission titles and details, login commands, paths and handoff text stay verbatim. Core does not change.
- **Outside the page:** the browser-tab title's attention count and the browser notification text follow the current language.

## Acceptance criteria

- [x] Component tests in Chinese:
  - every known kind renders its Chinese text, with commands, paths and agent text verbatim;
  - an unknown kind falls back to core's title;
  - the tab title and notification text are in Chinese.
- [x] Existing English tests, including the exact document-title assertions, pass unchanged, and the catalog completeness test passes.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex. All four branches were merged into main. The shared catalog conflicts were resolved by keeping every section, and checking that no line from main was lost. On main after the last merge: `pnpm test` passed (127 files, 1761 tests), and `typecheck`, `lint` and `format:check` passed. A browser check on Stintwork's own repo in `zh-CN` passed. The Needs-you button and queue were in Chinese. Known attention kinds are rendered from structured fields, and unknown kinds fall back to core's title.
