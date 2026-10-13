# 03 — Chinese Needs-you queue

Status: ready-for-agent
Blocked by: 01

## What to build

Make the Needs-you queue and attention alerts readable in Chinese (spec user stories 15–17 and 35).

- **The queue's own text:** move the Needs-you queue's English literals into the `en` catalog unchanged and add `zh-CN` entries. This covers the heading, empty state, notification toggle, permission answers (allow, deny and the other choices), handoff answers and developer notes.
- **Attention items:** render each known attention item kind from its structured fields with catalog messages: permission request, unresolved handoff, stage ready for approval, agent needs a login and checkpoint warning. Fall back to core's English `title` for an unknown kind. Agent-supplied permission titles and details, login commands, paths and handoff text stay verbatim. Core does not change.
- **Outside the page:** the browser-tab title's attention count and the browser notification text follow the current language.

## Acceptance criteria

- [ ] Component tests in Chinese:
  - every known kind renders its Chinese text, with commands, paths and agent text verbatim;
  - an unknown kind falls back to core's title;
  - the tab title and notification text are in Chinese.
- [ ] Existing English tests, including the exact document-title assertions, pass unchanged, and the catalog completeness test passes.
- [ ] All checks pass.
