# 02 — Chinese planning screens

Status: resolved
Blocked by: 01

## What to build

Translate the screens a developer uses to plan work (spec user stories 26–32), using ticket 01's language module and glossary terms. Move these screens' English literals into the `en` catalog unchanged, and add `zh-CN` entries:

- **The command palette:** placeholder, groups, commands and accessible names.
- **Create work item:** labels, workflow and milestone choices, the slug preview's surrounding text and the refusal messages Stintwork writes. Titles typed in Chinese keep working with the existing slug rules.
- **Roadmap editing:** controls and milestone statuses. Milestone names stay verbatim.
- **Customise workflow.**
- **The guided setup:** the explanation, buttons and per-agent skill guidance. File paths, diffs and install commands stay verbatim.

## Acceptance criteria

- [x] Component tests in Chinese:
  - each screen's main controls are findable by their Chinese accessible names;
  - paths, diffs, commands and milestone names render verbatim;
  - a Chinese title can be submitted from the create-work-item dialog.
- [x] Existing English tests pass unchanged, and the catalog completeness test passes.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex. All four branches were merged into main. The shared catalog conflicts were resolved by keeping every section, and checking that no line from main was lost. On main after the last merge: `pnpm test` passed (127 files, 1761 tests), and `typecheck`, `lint` and `format:check` passed. A browser check on Stintwork's own repo in `zh-CN` passed. The command palette was in Chinese (操作, 创建工作项, 自定义功能工作流), and work item titles stayed verbatim. Not resolved here:
- Chinese-only titles are refused because core's slug rule is ASCII-only. Mixed titles like "中文计划 API" work. This needs a core change and a follow-up ticket.
- The setup guide translates the per-agent skill hint by parsing core's English sentence, and falls back to verbatim if that wording changes.
