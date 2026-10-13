# UI language: Simplified Chinese

Status: ready-for-agent

Milestone: after v0.1. This work is not in `docs/plan.md` yet, so add a line for it under "Later" or under the next milestone when this spec is scheduled. See `GLOSSARY.md` (every term in it gets one fixed Chinese rendering) and ADRs 0001, 0006 and 0007.

## Problem Statement

Stintwork's web UI is English only. Every label, button, empty state, dialog and status message is an English literal written into the React components. `index.html` declares `lang="en"`, and nothing lets a developer change it. The README already has a Simplified Chinese version, but once a Chinese-speaking developer runs `npx stintwork`, the whole workbench is in English.

Many of the open-source developers we want to reach read Chinese more comfortably than English. To them, Stintwork's vocabulary (stints, briefs, handoffs, gates, the Needs-you queue) is new on top of a second language. That slows their first task and makes the project harder to recommend. Stintwork's v0.1 exit test is that a developer starts a real task within a minute without help, and an all-English UI makes that harder for this group.

## Solution

The web UI can be shown in English or Simplified Chinese (简体中文):

- **A language switcher** in the top bar lists "English" and "简体中文", each written in its own language. Choosing one changes the whole UI at once, with no reload, and keeps open drawers, dialogs and stints as they were.
- **A sensible first choice.** On a first visit, Stintwork follows the browser's language: any `zh` preference (`zh`, `zh-CN`, `zh-Hans`, `zh-SG`) chooses Simplified Chinese, and anything else chooses English. Once the developer picks a language, that choice wins and is remembered in this browser.
- **Everything Stintwork itself writes is translated:**
  - the top bar, board columns and cards, the drawer and its tabs;
  - the command palette, the Needs-you queue, attention items, permission prompts and handoff answers;
  - the stage agent rail, brief preview, stint stream and stint history;
  - the review overlay and findings, checks panels, memory proposals and ship actions;
  - create-work-item, roadmap editing, customise-workflow and the guided setup;
  - the connection screen, empty states, confirmations, accessible names and the browser-tab title.
- **What the developer or an agent wrote is never translated.** This covers:
  - work item titles, specs, tickets and handoff text;
  - stage names from a customised workflow, milestone names and file paths;
  - git branches, commands, agent output and diffs.
- **Consistent vocabulary.** Each glossary term has one Chinese rendering that is used everywhere. Agent and product names (Stintwork, Claude Code, Codex, Grok Build) are never translated.

## User Stories

1. As a Chinese-speaking developer, I want Stintwork to open in Simplified Chinese when my browser prefers Chinese, so that I can understand it from the first screen without changing a setting.
2. As an English-speaking developer, I want Stintwork to keep opening in English, so that nothing changes for me.
3. As a developer whose browser prefers a language Stintwork doesn't have, I want English, so that I get a complete UI rather than a mix.
4. As a developer, I want a language switcher in the top bar, so that I can change language without searching for a settings page.
5. As a developer, I want each language in the switcher written in its own script ("English", "简体中文"), so that I can find mine even when the UI is in a language I can't read.
6. As a developer, I want the switch to apply immediately without a reload, so that I don't lose an open drawer, a draft or a running stint view.
7. As a developer, I want my choice remembered across reloads and restarts of `npx stintwork`, so that I choose only once per browser.
8. As a developer, I want my explicit choice to override the browser's language, so that I can use English Stintwork in a Chinese browser, or the reverse.
9. As a developer sharing a repo with teammates, I want my language choice to stay out of the repo's files, so that it never produces a diff or a commit and never changes anyone else's UI.
10. As a Chinese-speaking developer, I want the board's column headings for the built-in workflows' stages (Clarify, Spec, Tickets, Implement, Review, Ship, Diagnose, Do) in Chinese, so that I can read the pipeline at a glance.
11. As a developer who customised a workflow, I want my own stage names shown exactly as I wrote them, so that Stintwork never rewrites my words.
12. As a Chinese-speaking developer, I want card badges, gate states and stage readiness text in Chinese, so that I can tell what each work item is waiting for.
13. As a Chinese-speaking developer, I want the work item drawer's tabs, section headings, buttons and empty states in Chinese, so that I can find the spec, tickets, stints and review.
14. As a developer, I want ticket titles, spec text and handoff text shown exactly as written, so that I see what is really in the repo.
15. As a Chinese-speaking developer, I want the Needs-you button, queue and every attention item kind (permission request, unresolved handoff, stage ready for approval, agent needs a login, checkpoint warning) in Chinese, so that I can act on them quickly.
16. As a Chinese-speaking developer, I want permission prompts' actions (allow, deny, always allow, and so on) in Chinese, while the command or path being asked about stays verbatim, so that I know exactly what I'm approving.
17. As a Chinese-speaking developer, I want login attention items to explain in Chinese what to do, while showing the login command exactly, so that I can copy and run it.
18. As a Chinese-speaking developer, I want the permission level names (Ask, Edit freely, Autonomous) and their explanations in Chinese, so that I choose the right level for an agent.
19. As a Chinese-speaking developer, I want the stage agent rail, brief preview and start, stop and resume controls in Chinese, so that I can run a stint confidently.
20. As a Chinese-speaking developer, I want the stint stream's own labels (tool call, plan, file edit, status, ended, interrupted) in Chinese, while the agent's messages and tool output stay as the agent produced them, so that I can follow what happened.
21. As a Chinese-speaking developer, I want the stint history's labels, relative times and dates in Chinese conventions, so that I can tell when each stint ran.
22. As a Chinese-speaking developer, I want the review overlay's controls and finding decisions (resolved, accepted, sent back) in Chinese, so that I can review without guessing.
23. As a Chinese-speaking developer, I want the checks panels and stale-evidence warnings in Chinese, while check commands and their output stay verbatim, so that I know whether a gate is blocked and why.
24. As a Chinese-speaking developer, I want memory proposals and their accept and reject actions in Chinese, so that I understand what will change in project memory.
25. As a Chinese-speaking developer, I want the ship actions, including the push confirmation, in Chinese, so that I never confirm something irreversible I didn't understand.
26. As a Chinese-speaking developer, I want the create-work-item dialog (title, workflow, milestone, intent and validation messages) in Chinese, so that I can start new work.
27. As a Chinese-speaking developer, I want work item titles I type in Chinese to work in every flow, so that I can write in my own language. Folder slugs stay whatever the existing slug rules produce.
28. As a Chinese-speaking developer, I want roadmap editing controls and milestone statuses in Chinese, while milestone names stay as written, so that I can plan.
29. As a Chinese-speaking developer, I want the customise-workflow flow in Chinese, so that I can adapt a workflow.
30. As a Chinese-speaking developer, I want the setup checklist and guided setup in Chinese, while file paths and the diffs to be written stay verbatim, so that I know what Stintwork will change in my repo.
31. As a Chinese-speaking developer, I want the warnings panel's chrome in Chinese. Warning text from parsing my files may stay in English for now, but it is clearly shown as a warning.
32. As a Chinese-speaking developer, I want the command palette's placeholder, groups and commands in Chinese, so that I can search and act from the keyboard.
33. As a developer, I want keyboard shortcuts (`c`, ⌘K / Ctrl+K, Escape) to be the same in both languages, so that muscle memory and docs still apply.
34. As a Chinese-speaking developer, I want the connection screen ("Opening your project", retrying) in Chinese, so that the very first screen is readable.
35. As a Chinese-speaking developer, I want the browser-tab title's attention count and browser notifications in Chinese, so that alerts make sense outside the page.
36. As a screen-reader user, I want accessible names, `aria-label`s and screen-reader-only text in the chosen language, and the page's `lang` attribute set to match, so that my screen reader pronounces it correctly.
37. As a Chinese-speaking developer, I want counts and pluralised phrases to read naturally in Chinese, without English plural endings, so that the UI doesn't look machine-translated.
38. As a Chinese-speaking developer, I want each glossary term (work item, ticket, stint, brief, handoff, gate, and so on) to have exactly one Chinese rendering everywhere, so that I can learn the vocabulary once.
39. As a Chinese-speaking developer, I want agent names and product names left in English, so that they match the CLIs I have installed.
40. As a Chinese-speaking developer, I want the layout to stay intact with Chinese text (no clipped buttons, no overflowing columns, readable CJK font fallback), so that the UI looks deliberate.
41. As a contributor adding a feature, I want adding a UI string without a Chinese translation to fail the checks, so that the Chinese UI never silently falls back to English.
42. As a contributor, I want all UI strings in one catalog per language, keyed by meaning, so that I can find and change copy without hunting through components.
43. As a Chinese-speaking contributor, I want to improve a Chinese translation by editing only that catalog, so that translation fixes are easy first contributions.
44. As a maintainer, I want the Chinese term choices recorded next to the glossary, so that future translations and contributors stay consistent.
45. As a maintainer, I want the structure to accept a third language later without touching components, so that we can grow if contributors ask for one.
46. As a maintainer, I want no new runtime dependency with native code and only a small bundle increase, so that `npx stintwork` stays fast and reliable (ADR 0007).

## Implementation Decisions

- **Web only.** All changes are in the `web` package. Core, server, agents, git and the CLI keep producing the same data. Views only read state and send actions (ADR 0006), and the language is purely a view concern.
- **Message catalogs.** There is one English catalog, the source of truth for keys, and one Simplified Chinese catalog. Keys are named by meaning, for example by area and purpose, not by English text. The Chinese catalog's type is derived from the English one, so a missing or extra key is a type error. Entries that take values (counts, names, paths) are functions of typed parameters rather than string templates. That handles English plurals and lets Chinese use its own word order. Catalogs hold plain strings only. Where a message embeds a path, command or name, the component renders that part as verbatim markup, such as `code`.
- **No i18n library.** A small in-house module is enough: two languages, no ICU message syntax and no runtime loading. Both catalogs are bundled. If a third language or more complex plural rules arrive, revisit this choice.
- **Language module interface.** A provider at the app root exposes the current language, a way to change it, and a translator (`t`) that components use through a hook. Supported languages are a closed set: `en` and `zh-CN`.
- **Choosing the language.** In order:
  1. a stored explicit choice;
  2. otherwise the first `navigator.languages` entry whose primary subtag is `zh`, which chooses `zh-CN`;
  3. otherwise `en`.
  The choice is stored in `localStorage` under a `stintwork.`-prefixed key, like the existing attention-notification preference. Reads and writes are wrapped so that blocked storage falls back to detection. It is never written to repo files: it is a per-browser view preference, not project state (ADR 0001).
- **Document language.** The provider keeps `document.documentElement.lang` in sync (`en` or `zh-CN`). The static `index.html` keeps `lang="en"` as the pre-render default.
- **Switcher.** A compact control in the top bar, an accessible `select` or menu labelled in the current language. Each option is labelled in its own language and marked with its own `lang`.
- **What gets translated.** Everything the web app writes itself: visible text, `aria-label`s, `title`s, placeholders, screen-reader-only text, confirmations, the tab-title suffix and browser notification text.
- **What does not.** Content from the repo, the developer or an agent is never passed through `t`. This covers:
  - work item, ticket, spec and milestone titles and bodies;
  - handoff text, agent messages, tool calls and output;
  - diffs, file paths, commands and branch names;
  - stage names of customised workflows;
  - warning messages produced by core.
- **Built-in stage names.** When a stage belongs to a built-in workflow that has not been customised, its column heading and labels come from the catalog by workflow and stage id. Otherwise the name from the workflow YAML is shown verbatim. Workflow names follow the same rule.
- **Attention items.** Core's attention items carry a kind plus structured fields (agent, stage, tool call, request title). The web renders known kinds from the catalog using those fields, and falls back to core's English `title` for unknown kinds. Permission request titles and details supplied by the agent stay verbatim.
- **Dates and numbers.** Times and dates are formatted with `Intl` in the current language. Hand-built English date strings are replaced.
- **Terminology.** Add a "Chinese terms" table to `GLOSSARY.md`, with one rendering per term. The catalog must use exactly these. Proposed starting set, which the implementer may refine and must justify in the ticket:

  | English | 中文 |
  |---|---|
  | Project | 项目 |
  | Milestone | 里程碑 |
  | Work item | 工作项 |
  | Ticket | 工单 |
  | Spec | 规格说明 |
  | Shipped | 已交付 |
  | Workflow | 工作流 |
  | Stage | 阶段 |
  | Gate | 关卡 |
  | Skill | 技能 |
  | Agent | Agent |
  | Stint | Stint (untranslated; it is the product's root word) |
  | Brief | 简报 |
  | Handoff | 交接 |
  | Checkpoint | 检查点 |
  | Permission level | 权限级别 (问询 / 自由编辑 / 自主) |
  | Attention item | 待处理事项 |
  | Needs you | 待你处理 |
  | Project memory | 项目记忆 |
  | Memory proposal | 记忆提案 |
  | Decision record | 决策记录 |
  | View / Pipeline | 视图 / 流水线 |

- **Typography.** Extend the font stack with common CJK fallbacks (for example PingFang SC, Microsoft YaHei, Noto Sans CJK SC) without changing Latin rendering. Fix any control whose width assumed English text.
- **Migration.** Move existing English literals into the English catalog unchanged, so English output is byte-for-byte identical and the existing English tests keep passing. Then add the Chinese catalog.

## Testing Decisions

- **A good test checks what the developer sees and does**: roles, accessible names, visible text, the `lang` attribute and the persisted preference. It does not check catalog internals, hook calls or component structure.
- **One seam, already in use.** Components render from a core fixture snapshot (`indexProject(createMemoryRepoFiles(...))`) with Testing Library. Tests choose a language through the same provider the app uses, or by setting the stored preference or `navigator.languages` before render. There are no new seams in core or server.
- **Behaviour to cover:**
  - detection from `navigator.languages` (`zh-CN`, `zh-TW`, `zh` → Chinese; `fr`, `en-GB` → English);
  - a stored choice overrides detection;
  - switching with the top-bar control re-renders without losing an open drawer, and updates `document.documentElement.lang`;
  - blocked `localStorage` still renders;
  - in Chinese, the board shows built-in stage headings in Chinese, a customised workflow's stage names verbatim, and repo titles verbatim;
  - in Chinese, the Needs-you queue renders each known attention kind in Chinese, with commands and paths verbatim;
  - the tab-title count and notification text are in the chosen language.
- **The one new check:** catalog completeness. Every English key exists in the Chinese catalog, and no Chinese entry is empty or identical to English, except for an explicit allowlist (product and agent names, "Stint", "Agent"). The type check also enforces key parity.
- **Existing tests stay English.** The default in tests is English, so current assertions on English copy remain valid and prove the migration changed nothing.
- **Prior art:**
  - `Board.test.tsx`: fixture repo, rendering by column;
  - `NeedsYouQueue.test.tsx`: `localStorage` preference, document title and notifications;
  - `TopBar` behaviour covered through the board tests;
  - `SetupGuide.test.tsx` and `CreateWorkItem.test.tsx` for dialogs.
- **Manual check before resolving:** open Stintwork on its own repo in a browser preferring `zh-CN` and go through the board, drawer, a stint, the Needs-you queue, review, setup and create-work-item. Record screenshots or notes of any clipping in the ticket.

## Out of Scope

- Languages other than English and Simplified Chinese, including Traditional Chinese. `zh-TW` and `zh-HK` get Simplified Chinese for now.
- Translating CLI output, server error messages, core warnings and git or `gh` messages. (Updated 2026-10-12: core and server sentences the UI shows, such as gate reasons and stream notes, are now covered by ticket 08. The rest stays out of scope.)
- Translating the skills, prompts or briefs sent to agents, or asking agents to reply in Chinese.
- Translating repo content: specs, tickets, handoffs and workflow YAML.
- Translating the documentation site, getting-started guide or ADRs. The README is already bilingual.
- A per-project or server-side language setting, or syncing the choice across browsers.
- Right-to-left layout.

## Further Notes

- The motivation is reach: the Chinese README exists, and making the first screen readable is the next step for Chinese-speaking contributors. It also makes translation fixes an easy first contribution.
- Catalog completeness is the guard against drift. Without it, every future feature risks shipping English-only strings into the Chinese UI.
- A native-speaker review of the Chinese catalog before release is worth more than any automated check. Note the reviewer in the ticket.
- Splitting into tickets: (1) the language module, switcher and detection, with the English catalog extracted with no visible change; (2) the Chinese catalog, glossary terms and typography; (3) structured rendering of attention items and built-in stage names; (4) the manual check in the real app. Tickets 2 and 3 are blocked by 1, and 4 is blocked by all of them.
