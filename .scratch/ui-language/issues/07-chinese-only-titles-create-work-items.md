# 07 — Chinese-only titles can create work items

Status: resolved
Blocked by: none

## What to build

Spec user story 27 promises that a title typed in Chinese works in every flow. Today it doesn't. Core derives the work item's slug from the title by keeping only ASCII letters and digits, so a title like "导出看板为 CSV" gives `csv`, and a Chinese-only title like "修复登录" gives nothing. The create-work-item dialog then refuses it with "Title must produce a valid ASCII work item slug." and the Create button stays disabled. Ticket 02 found this on 2026-10-12.

The slug stays ASCII kebab-case of at most 48 characters, because it names the feature folder, the git branch and the worktree. A Chinese-speaking developer must still be able to create a work item from a Chinese-only title:

- The dialog shows the slug as an editable field, prefilled with the derived slug when there is one.
- If the derived slug is empty, the field starts empty. A short message in the current language asks for a folder name in English letters, digits and hyphens. Create stays disabled until it is valid.
- Once the developer edits the slug, retyping the title doesn't overwrite it.
- Server and core accept an explicit slug alongside the title. They validate it with the same rules as a derived slug (ASCII kebab-case, at most 48 characters, not already a work item, worktree or existing path), and refuse anything else with a clear reason. Without an explicit slug they behave as today.
- The title is stored verbatim in `workflow.yaml` and shown on the card and drawer in Chinese. The roadmap entry and the commit message ("Create work item <slug>") use the slug.
- No transliteration dependency (pinyin and the like). It would add bundle weight and guess wrong for names.

## Acceptance criteria

- [x] Core tests: an explicit slug is validated and used; invalid, too-long or non-ASCII explicit slugs are refused; behaviour without one is unchanged.
- [x] Server tests: preview and create with a Chinese-only title plus an explicit slug, with one commit; duplicate and invalid explicit slugs are refused.
- [x] Component tests, in Chinese and English:
  - a Chinese-only title shows the empty slug field and its hint, and Create is disabled until the slug is valid;
  - an edited slug survives title edits;
  - the created card shows the Chinese title verbatim.
- [x] The catalog completeness test passes with the new strings, and existing tests pass unchanged.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-13:** Built by Codex on the integration branch `ui-language-followups`.

The create dialog now has an editable folder-name field:
- it is prefilled from the title, and an edited value survives title changes;
- when the title yields no folder name, it starts empty with a hint.

Core and server accept an explicit slug under the existing rules, and the title is saved as typed (trimmed).

Code-review round:
- core now trims the title whether or not a slug is given;
- the folder-name rule and the duplicate refusals ("already exists", and "already exists in Git") have codes and render in Chinese;
- the hint shows only when the title yields no folder name.

Coordinator checks in a fresh clone of the final branch:
- `pnpm install --frozen-lockfile` passed;
- `pnpm test` passed, 2100 tests;
- `typecheck`, `lint`, `format:check`, `build` and `smoke:package` passed.
