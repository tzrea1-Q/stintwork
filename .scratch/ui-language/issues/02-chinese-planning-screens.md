# 02 — Chinese planning screens

Status: ready-for-agent
Blocked by: 01

## What to build

Translate the screens a developer uses to plan work (spec user stories 26–32), using ticket 01's language module and glossary terms. Move these screens' English literals into the `en` catalog unchanged, and add `zh-CN` entries:

- **The command palette:** placeholder, groups, commands and accessible names.
- **Create work item:** labels, workflow and milestone choices, the slug preview's surrounding text and the refusal messages Stintwork writes. Titles typed in Chinese keep working with the existing slug rules.
- **Roadmap editing:** controls and milestone statuses. Milestone names stay verbatim.
- **Customise workflow.**
- **The guided setup:** the explanation, buttons and per-agent skill guidance. File paths, diffs and install commands stay verbatim.

## Acceptance criteria

- [ ] Component tests in Chinese:
  - each screen's main controls are findable by their Chinese accessible names;
  - paths, diffs, commands and milestone names render verbatim;
  - a Chinese title can be submitted from the create-work-item dialog.
- [ ] Existing English tests pass unchanged, and the catalog completeness test passes.
- [ ] All checks pass.
