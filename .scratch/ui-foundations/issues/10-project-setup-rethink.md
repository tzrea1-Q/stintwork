<!-- SPDX-License-Identifier: Apache-2.0 -->
# 10 — Rethink Project setup

Status: ready-for-human
Blocked by: none

## Findings

Coordinator review on a real project, 2026-10-16 (no project content copied):

- A GitHub Issues tracker guide was treated as missing local Markdown tracking. Its whole-file replacement was pre-selected, despite another check saying the tracker guide was ready: a data-loss default.
- The dialog did not explain its purpose or what the developer gets.
- Optional or informational items, including the glossary that setup cannot create and the roadmap, were labelled “Needs attention”.
- Replacements looked like appends, and all changes were selected initially.
- Skills were a 30-row wall (10 stages across three agents), including ten identical unknown Grok Build entries.
- Naming drifted between “Project setup…”, “Set up project” and “Setup”.

## What to build

Detect the declared tracker: local Markdown, GitHub Issues by guide title/content, or unknown/other. Preserve existing guides by default. Offer switching another tracker to local Markdown only as an explicit, unselected, destructive change. Only offer the local Markdown AGENTS.md pointer when local Markdown is used or explicitly selected; never rewrite a different existing pointer. Each change reports removed-line count and default selection, false whenever lines are removed. Keep both API sides aligned and retain dirty-target refusal.

Use “Project setup” / “项目设置” in the menu, dialog, docs and catalogs. Explain in at most two sentences that Stintwork reads local Markdown work items in `.scratch/`, agents find the tracker through AGENTS.md, and local run data stays out of Git. For another tracker, instead explain which tracker is used, that only local Markdown tickets are displayed today, and that reading GitHub Issues is planned (plain, link-free copy).

Group checks into Required (tracker guide and agent instructions pointer), Recommended (local run-data ignore and milestone roadmap), and Good to have (glossary and decision records). Use catalog-defined Ready / Needs a change / Optional / Uses another tracker badges in both languages; good-to-have items are informational, not attention items.

Show destructive changes with a danger “Replaces N lines” / “替换 N 行” badge, initially unselected. Review lists them separately under “These changes remove existing content”, with visible diffs before confirmation, without a typed-confirmation step.

Show one collapsed skill summary per agent, such as “Codex: 10 of 10 found” or “Grok Build: can't check”. Expand only missing/unknown skills, grouped by workflow; show the read-only explanation once. When nothing is needed, say “This project is set up for Stintwork.” and retain the skill summary.

## Acceptance criteria

- [x] Core fixtures written from scratch cover GitHub Issues, unknown/other and local Markdown detection, safe defaults, removed-line counts and tracker-dependent pointer proposals.
- [x] Server tests cover the updated plan, explicit switching, selective writes and refusal of uncommitted targets.
- [x] Web behaviour tests cover both-language copy, grouping, defaults, destructive review, collapsed skill summaries, and existing keyboard/focus/dismissal behaviour.
- [ ] A GitHub-tracked fixture written from scratch is in the browser harness; dialog cases cover 1440, 1024, 768 and 390px, both languages, and both colour schemes at 1440 and 390px; they assert the notice and unselected destructive changes and wait for overlay readiness before acting.
- [x] Documentation uses the agreed Project setup name and explains tracker preservation and opt-in switching.
- [x] Record only checks actually run. The sandbox cannot bind sockets: the coordinator runs e2e and returns results in this session.

## Scope

`packages/core`, `packages/server`, `packages/web`, docs naming Setup, `GLOSSARY.md` only if needed, and ui-foundations tickets 07 and 10. No dependencies, commits, unrelated project content or tracker integration; GitHub Issues reading remains M11.

## Comments

**Coordinator, 2026-10-16:** The maintainer found Project setup rough and unclear on a real project. The coordinator confirmed the destructive tracker-replacement default. The decisions above are agreed; M8 exit waits for this ticket as well as 06, 08 and 09.

**Codex, 2026-10-16:** Implemented; ready for coordinator browser verification, not resolved. Existing tracker declarations are preserved by default. Local pointer changes depend on selecting the tracker proposal (including for a bare project), with the dependency rechecked server-side rather than trusting client metadata. Existing different pointers are preserved. Removed-line counts reuse the same diff implementation as the preview, including unterminated-line changes, so the badge and review agree. Missing informational items do not produce attention badges. The empty state retains only the skill summary, not a wall of ready checks. No dependency changes or commits.

Checks actually run against this worktree:

- All core and web tests plus server setup tests: **86 files, 1,572 tests passed**. Command: `node node_modules/vitest/vitest.mjs run --config /private/tmp/uif10-vitest.config.mjs --configLoader runner packages/core/src packages/web/src packages/server/src/setup.test.ts`.
- TypeScript checks passed for core, server and web with `/private/tmp/uif10-{core,server,web}-tsconfig.json` and `node node_modules/typescript/bin/tsc --noEmit -p <config>`.
- Biome format check and lint passed for all 22 changed TypeScript files. `node scripts/check-licence-headers.mjs` passed (323 package source files); `git diff --check` passed.
- Production web build passed: `node packages/web/node_modules/vite/bin/vite.js build --config /private/tmp/uif10-vite.config.mjs --configLoader runner`. It emitted dependency “use client” and bundle-size warnings, not build failures.
- Browser discovery only: `node packages/web/node_modules/@playwright/test/cli.js test --config packages/web/playwright.config.ts --list top-bar.spec.ts` collected 32 cases, including 12 new GitHub Project setup cases. No browser cases were run and no screenshot/layout pass is claimed.

The worktree's inherited `node_modules` links resolve workspace packages to another checkout. Temporary validation configs under `/private/tmp` map workspace packages to this worktree's source; they are not project changes. The normal pnpm attempt stopped at its shared-modules safety guard; no dependencies were replaced. A no-socket `tsx` import check confirmed `TSX_TSCONFIG_PATH=/private/tmp/uif10-server-tsconfig.json` resolves the current planner.

Coordinator browser handoff: the current web bundle is built. Run `TSX_TSCONFIG_PATH=/private/tmp/uif10-server-tsconfig.json node packages/web/node_modules/@playwright/test/cli.js test --config packages/web/playwright.config.ts` outside the no-socket sandbox. The harness starts separate local-Markdown and GitHub fixture projects on the base port and the following port. Return browser results here; keep this ticket and M8 exit pending until they pass.

Changed paths:

- Core: `packages/core/src/setup.ts`, `packages/core/src/setup-plan.ts`, `packages/core/src/line-diff.ts`, `packages/core/src/index.ts`, `packages/core/src/setup.test.ts`, `packages/core/src/setup-plan.test.ts`, `packages/core/src/project.test.ts`.
- Server: `packages/server/src/setup-writes.ts`, `packages/server/src/setup.test.ts`.
- Web: `packages/web/src/SetupGuide.tsx`, `packages/web/src/TopBar.tsx`, `packages/web/src/ui/line-diff.ts`, `packages/web/src/i18n/en.ts`, `packages/web/src/i18n/zh-CN.ts`, `packages/web/src/i18n/catalog.test.ts`, `packages/web/src/SetupGuide.test.tsx`, `packages/web/src/TopBar.test.tsx`, `packages/web/src/Board.test.tsx`, `packages/web/src/Language.test.tsx`.
- Browser harness: `packages/web/e2e/top-bar.spec.ts`, `packages/web/e2e/server.ts`, `packages/web/playwright.config.ts`, `packages/web/e2e/README.md`, `packages/web/e2e/fixtures/github-project/AGENTS.md`, `packages/web/e2e/fixtures/github-project/docs/agents/issue-tracker.md`.
- Documentation: `README.md`, `README.zh-CN.md`, `docs/getting-started.md`, `docs/plan.md`, `docs/release-notes/0.1.0.md`, `docs/release-notes/0.1.1.md`.
- Tracker: `.scratch/ui-foundations/issues/07-m8-exit.md`, `.scratch/ui-foundations/issues/10-project-setup-rethink.md`.
