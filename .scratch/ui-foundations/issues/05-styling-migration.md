# 05 — Feature styling and controls use the foundations

Status: ready-for-agent
Blocked by: 02, 03, 04

## What to build

Migrate feature CSS to Tailwind utilities and the mapped tokens, following `docs/agents/frontend.md`. Remove dead CSS and imports after each migration. Keep feature CSS only for rules utilities cannot express, with the reason recorded beside the rule. Both colour schemes come from the token file, including colours, radius, spacing, type scale and shadows.

Use ticket 02's language menu in the work-item drawer, then remove the unused native LanguageSelect. Preserve language detection, persistence and drawer state when changing language. Finish any remaining native selects or bespoke menus, popovers, dialogs, sheets and tooltips with `src/ui/` components. Add a missing wrapper with its own behaviour test before using it.

Keep existing product actions and all four view states intact. Run the browser specs from 01–04 after migration, including both colour schemes at 1440 and 390px. Complete screen coverage follows in 06.

## Acceptance criteria

- [ ] Feature styles use Tailwind theme classes backed by `styles/tokens.css`. Dead CSS and imports are removed; each retained feature CSS rule has a recorded utilities limitation.
- [ ] Existing menus, popovers, dialogs, sheets, tooltips and selects use `src/ui/` components. Any added wrapper has its own behaviour test.
- [ ] The drawer shares the top-bar language menu and the unused LanguageSelect is removed. Tests cover keyboard selection, focus return, persistence and retained drawer state in both languages.
- [ ] Existing browser specs pass at 1440, 1024, 768 and 390px in `en` and `zh-CN`; light and dark also pass at 1440 and 390px in both languages. Layout supports 360px.
- [ ] Those cases have no horizontal page scroll, accidental clipping or overlay gutter violations. Truncated names expose their full text.
- [ ] Screenshots are saved. Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages and both colour schemes.

## Comments

**Codex, 2026-10-13:**

- Migrated the board/cards/columns, drawer, Needs you, gate/handoff, review/findings/checks/ship, setup, planning dialogs, brief preview and stint/history surfaces to Tailwind utilities backed by the existing colour, type, icon, radius, spacing and shadow tokens. Deleted all eight feature stylesheets (`checks-panel.css`, `handoff-answer.css`, `handoff-card.css`, `needs-you.css`, `review-overlay.css`, `setup-guide.css`, `stage-agent-rail.css`, `stint-stream.css`) and their imports. `style.css` now contains imports and document-wide base defaults only; no feature CSS rule remains, so there is no retained-feature-rule utilities limitation to report.
- The drawer now uses the same `LanguageMenu` as the top bar; removed `i18n/LanguageSelect.tsx` and migrated its test consumers. Stage-agent, workflow, milestone, roadmap, brief-agent/permission and review-filter controls now compose the shared Radix Select through `ui/SelectField.tsx`, including empty milestone values, unavailable options, explicit label associations and full-title truncation. Added `ui/Badge.tsx`, `ui/CodeBlock.tsx` and `ui/Markdown.tsx`, each with a behaviour test; shared code regions preserve original whitespace and allow independent keyboard scrolling. Existing actions use Button variants; inferred-card tooltips and publishing/PR-merge confirmations use the shared portalled primitives. Confirmations guard dismissal during writes and return focus to their opener. All new files carry the Apache-2.0 SPDX header. No dependency, lockfile or frontend-guide change was needed.
- Fixed the coordinator's four regressions: registered-agent warnings share the drawer's horizontal padding; the drawer language control and remaining native selects use shared controls; the toolbar milestone deliberately truncates with `data-truncate` and its complete `title`; Needs you code/JSON, Markdown, setup/customise, check output, stint output and publishing previews scroll within their own boxes instead of wrapping long code.
- Extended `e2e/board.spec.ts`, `dialogs.spec.ts`, `drawer-and-needs-you.spec.ts` and `top-bar.spec.ts`; added `e2e/feature-styling.spec.ts` for gates/handoffs/replay and nested publishing/merge confirmations. Cases use the shared layout helper at 1440/1024/768/390/360px in en/zh-CN, with light/dark at 1440/390. Added padding/truncation assertions, actual code/JSON scrolling, language persistence/disclosure-state checks, select/menu/tooltip/confirmation screenshots, keyboard dismissal and focus-return checks. Browser discovery collects 174 tests in six files; this is not a browser pass or screenshot evidence.
- TDD: new wrappers first failed on their missing imports, then passed their behaviour checks. Focused existing action tests were exercised while migrating native selects and language controls; obsolete native-select and single-text-node assertions were updated to the rendered shared-control behaviour without removing the action/status assertions. Final web Vitest result: 47 files, 500 tests passed.

Checks actually run (pnpm commands use `--config.verify-deps-before-run=false` for the coordinator's shared install):

- `pnpm --config.verify-deps-before-run=false format:check` — exit 0; checked 335 files, no fixes.
- `pnpm --config.verify-deps-before-run=false lint` — exit 0; licence headers and lint passed, 336 files checked. Biome emits its configuration-migration information message; the configuration was not changed.
- `pnpm --config.verify-deps-before-run=false typecheck` — exit 0; root and all six package typechecks passed.
- `pnpm --config.verify-deps-before-run=false --filter @stintwork/web test --configLoader native` — exit 0; 47 test files / 500 tests passed.
- `pnpm --config.verify-deps-before-run=false --filter @stintwork/web exec playwright test --list` — exit 0; 174 tests / six files collected only, no browser execution.
- `pnpm --config.verify-deps-before-run=false --filter @stintwork/web exec vite build --configLoader native` — exit 0; production assets built. Non-fatal warnings: dependency-level `use client` directives ignored and the JavaScript chunk exceeds 500 kB.
- `git diff --check` — exit 0.

Browser/server tests were not run because this sandbox cannot bind sockets. No browser screenshots or real-browser visual review are claimed. Ticket 05 still needs the coordinator's complete browser run and screenshot/interaction review at 1440/390 in both languages and colour schemes, including any resulting repairs. Ticket 06 owns the remaining exhaustive screen/state matrix and CI/revision-linked screenshot evidence. Status and acceptance checkboxes are unchanged. No commit or push was made.

**Codex, 2026-10-13:** Coordinator browser-run repairs

Reviewed the coordinator's `e2e-run1.log`, failure page snapshots and screenshots in `artifacts1/test-results`, plus representative board/drawer/setup/create traces. The coordinator reported 64 failures out of 174 browser tests and passing unit/typecheck/lint/format/build checks; those are coordinator results, not locally rerun browser/server evidence. Classification and targeted repairs:

- **Top bar / setup (18 cases): app defect.** The screenshot shows the proposed code extending past its parent rather than overflowing inside its own box. The setup changes fieldset retained the browser's intrinsic minimum width, so its long preformatted content enlarged the fieldset. Added `min-w-0` to that fieldset, matching the existing create/customise fieldsets. Kept the actual horizontal-scroll and keyboard-scroll browser assertions unchanged. Added a sizing guard to the existing Chinese setup behaviour test.
- **Create and roadmap, 768px in en/zh-CN (4 cases): app defect.** Both screenshots show the long milestone option enlarging the Select popup almost to the viewport edge; the trace shows its intrinsic-width wrapper being positioned at a rounded pixel boundary. Shared `SelectContent` now explicitly matches its trigger width, allowing long options to wrap within the popup instead of expanding it towards the gutter. The 16px layout-helper expectation is unchanged; all Select consumers receive the fix. Added a width guard to the existing select navigation/selection/focus-return test.
- **Board inferred tooltip (14 cases): spec input sequencing defect, not a reason to disable hoverable tooltips.** The trace shows a single synthetic pointer jump from the trigger to `(0, 0)`, followed by no further pointer movement. Radix creates a hover-transit grace area on pointer leave and evaluates subsequent pointer movement to dismiss it. ADR 0010 and the frontend guide assign tooltip interaction to Radix; demanding dismissal from that incomplete synthetic transition would bypass its hoverable-content behaviour. The spec now moves through ten intermediate pointer positions. It still requires the tooltip to become hidden, still checks its layout, and still saves its open screenshot; no expectation was removed or weakened.
- **Drawer language (14 cases): spec input sequencing defect.** Unlike the existing top-bar test, the drawer spec sent Enter immediately after ArrowUp/ArrowDown. Radix roving focus schedules the arrow-key focus change asynchronously, so Enter could select the still-focused current language. Added the same other-radio `toBeFocused()` wait used by the top bar before Enter. This preserves Radix-owned focus handling required by the guide rather than replacing it with custom synchronous navigation. Language change, persistence, disclosure-state and focus-return expectations remain unchanged. Added two passing nested-sheet language navigation behaviour cases, covering en and zh-CN and pointer departure.
- **Publishing/merge confirmations (14 cases): invalid spec fixture, not an app defect.** The failure screenshot/page snapshot says the project server returned an invalid snapshot, before any card or confirmation opened. The fixture changed `stage` to `ship` but inherited `column: spec`, contradicting the workflow stage/column contract and the ticket's requirement to preserve valid existing flows. Set both fixture fields to `ship`; did not weaken snapshot validation, change production behaviour or remove any nested-dialog assertion. This allows the intended publishing/merge cases to reach their target surfaces.

No browser expectation changed. The three spec-only corrections above repair the synthetic input sequence or invalid fixture; their documentation basis and retained expectations are recorded individually. No language-menu or tooltip production workaround was added.

TDD/checks actually run (all pnpm commands use `--config.verify-deps-before-run=false`):

- `pnpm --filter @stintwork/web test --configLoader native src/SetupGuide.test.tsx src/ui/Select.test.tsx` — exit 1 before the app fixes: exactly the two new sizing guards failed, seven tests passed. These are jsdom sizing guards, not browser geometry verification.
- `pnpm --filter @stintwork/web test --configLoader native src/TopBar.test.tsx` — exit 0; six tests passed, including the two new nested-sheet cases. This did not reproduce the browser's immediate-Enter race; the trace and Radix focus scheduling provided that diagnosis.
- `pnpm --filter @stintwork/web test --configLoader native src/SetupGuide.test.tsx src/ui/Select.test.tsx src/TopBar.test.tsx` — exit 0 after the fixes; three files / 15 tests passed.
- `pnpm exec biome format --write packages/web/src/TopBar.test.tsx packages/web/src/SetupGuide.test.tsx packages/web/src/ui/Select.test.tsx` — exit 0; three files checked, two formatted.
- `pnpm format:check` — exit 0; 335 files checked, no fixes.
- `pnpm lint` — exit 0; licence/lint checks passed, 336 files checked, existing Biome configuration-migration information only.
- `pnpm typecheck` — exit 0; root and all six package checks passed.
- `pnpm --filter @stintwork/web test --configLoader native` — exit 0; 47 files / 502 tests passed.
- `pnpm --filter @stintwork/web exec vite build --configLoader native` — exit 0; production assets built. Existing non-fatal dependency `use client` and greater-than-500kB chunk warnings remain.
- `pnpm --filter @stintwork/web exec playwright test --list` — exit 0; 174 tests in six files discovered only.
- `git diff --check` — exit 0.

Browser/server tests were not run locally because the sandbox cannot bind sockets. Ticket 05 still needs the coordinator's rerun of all 174 browser cases and the resulting visual/interaction review, especially the newly reachable publishing/merge assertions. Ticket 06's exhaustive state matrix and revision-linked screenshot/CI evidence remain unchanged. Ticket Status and acceptance checkboxes are unchanged. No dependency, frontend-guide, commit or push change.

**Codex, 2026-10-13:** Repairs after the second coordinator browser run

Reviewed `e2e-run2.log`, representative failure snapshots/screenshots, and drawer/publishing/setup traces from `artifacts2/test-results`. The coordinator reported 128 browser cases passing and 46 failing, with board and dialog groups green. That is coordinator evidence, not a local browser run. The remaining groups are addressed as follows:

- **Top bar / setup (18 cases): additional spec locator defect.** The previous fieldset fix now visibly confines the AGENTS.md code to its box, but `setup.locator("pre").last()` selected the later roadmap preview's pre element, inside a closed details disclosure. Measuring that hidden element returns zero dimensions. Requiring a closed preview to overflow contradicts the frontend guide's progressive-disclosure rule; opening all previews or weakening the scrolling assertion would be the wrong fix. Scoped the locator to the named AGENTS.md change region and its visible code regions, then added visibility and exact proposed-content assertions before the existing actual horizontal-scroll/ArrowRight checks. Added a behaviour test proving that opening AGENTS.md leaves the roadmap disclosure collapsed while its content remains in the DOM. This corrects the remaining failure's attribution: it was measuring the wrong preview, not evidence that the fieldset repair failed.
- **Drawer stage agent picker (14 cases): app focus-return defect.** Choosing an option disables the trigger while its save is pending. Radix's close autofocus then attempts to focus a disabled button; enabling it later does not restore focus. The new nested-sheet tests reproduced focus remaining on body after both successful and refused saves. Shared `SelectField` now records this deferred restoration in its close-autofocus hook and focuses the trigger when it becomes enabled, only if focus remains on body. Normal Radix close behaviour is unchanged, and an additional behaviour test verifies that a user moving to another control does not have focus stolen. No focus assertion or disabled-state behaviour was weakened.
- **Publishing/merge confirmations (14 cases): app focus-return defect.** Preview requests disable their action buttons before the confirmation mounts, so capturing the globally active element at dialog mount can capture body or the containing sheet rather than the originating action. An initial blur-only jsdom probe passed; extending it to cover parent-sheet focus during the pending request and code-region focus before dismissal reproduced both publishing and merge failures, with focus on the parent sheet. Shared `DialogContent` now accepts an explicit `returnFocusRef`, handled through Radix's close-autofocus hook. Both Ship preview actions retain their own button ref and supply it to their confirmation. Restoration ignores disconnected/disabled targets and no longer suppresses Radix's fallback when no usable target exists. Both new nested-sheet cases now pass. Existing browser dismissal, parent-sheet visibility and trigger-focus expectations remain unchanged.

The supplied focus-failure snapshots identify the inactive expected trigger but do not explicitly record `document.activeElement`; the body/sheet focus observations above come from the local runnable regressions, not an invented browser focus dump. No browser expectation was removed or weakened. The setup locator correction is the only browser-spec change in this repair, with its documentation basis recorded above.

Checks actually run (all pnpm commands use `--config.verify-deps-before-run=false`):

- `pnpm --filter @stintwork/web test --configLoader native src/StageAgentRail.test.tsx` — exit 1 before the SelectField fix; two pending-save focus tests failed, seven tests passed.
- `pnpm --filter @stintwork/web test --configLoader native src/StageAgentRail.test.tsx src/ui/SelectField.test.tsx` — exit 0 after the fix; two files / 11 tests passed.
- `pnpm --filter @stintwork/web test --configLoader native src/PullRequests.test.tsx` — first blur-only probe exited 0 (12 passed); the strengthened sheet-focus probe exited 1 (two failed / ten passed) before the dialog/Ship fixes.
- `pnpm --filter @stintwork/web test --configLoader native src/PullRequests.test.tsx src/ui/Dialog.test.tsx src/ShipActions.test.tsx` — exit 0 after the fixes; three files / 27 tests passed.
- `pnpm --filter @stintwork/web test --configLoader native src/ui/SelectField.test.tsx src/SetupGuide.test.tsx` — exit 0; two files / 11 tests passed, including no-focus-stealing and independent disclosure coverage.
- `pnpm exec biome format --write packages/web/src/StageAgentRail.test.tsx packages/web/src/PullRequests.test.tsx packages/web/src/SetupGuide.test.tsx packages/web/src/ui/SelectField.tsx packages/web/src/ui/SelectField.test.tsx packages/web/src/ui/Dialog.tsx packages/web/src/ShipActions.tsx packages/web/e2e/top-bar.spec.ts` — exit 0; eight files checked, six formatted. A later targeted formatting run on `StageAgentRail.test.tsx` and `ui/SelectField.test.tsx` exited 0, checking two files and formatting one after the typecheck correction.
- `pnpm format:check` — exit 0; 335 files checked, no fixes.
- `pnpm lint` — exit 0; licence/lint checks passed, 336 files checked, existing Biome configuration-migration information only.
- `pnpm typecheck` — initially exited 2 because two new Testing Library queries incorrectly used Playwright's `exact` option. Removed those unsupported options (Testing Library string role names already match exactly); rerun exited 0, passing root and all six package checks.
- `pnpm --filter @stintwork/web test --configLoader native` — exit 0; 47 files / 508 tests passed, including a repeat after the test-query type correction.
- `pnpm --filter @stintwork/web exec vite build --configLoader native` — exit 0; production assets built with the existing non-fatal dependency `use client` and greater-than-500kB chunk warnings.
- `pnpm --filter @stintwork/web exec playwright test --list` — exit 0; 174 browser cases in six files discovered only.
- `git diff --check` — exit 0.

No browser/server tests ran locally because of the socket-binding restriction. Ticket 05 still needs the coordinator's rerun of all 174 cases and review of the newly reached setup/publishing/merge states; no all-green browser result is claimed. Ticket 06's exhaustive state matrix and revision-linked screenshot/CI evidence remain unchanged. Status and acceptance checkboxes are unchanged. No new file, dependency, frontend-guide change, commit or push.

**Codex, 2026-10-13:** Repairs after the third coordinator browser run

The coordinator reported 158 passed / 16 failed. Inspected `e2e-run3.log` and the copied `packages/web/coverage/e2e/test-results/` error contexts, screenshot and trace; these are coordinator artifacts, not a local browser run.

- **Drawer switch-back (13 failures): unsynchronised test input.** The second toggle sent Arrow and Enter without waiting for initial/current-item focus or Radix's deferred arrow navigation. Both drawer and top-bar specs now wait for the currently selected other-language item, send the arrow, wait for the original-language item, then send Enter. They assert restored HTML language, persisted language and trigger focus. No expected product behaviour or assertion was removed or weakened; this changes input sequencing, not a requirement. Nested-sheet behaviour tests now cover the return trip in both languages, and two additional top-bar tests preserve pointer selection/reopening coverage.
- **Top-bar milestone menu (three failures, 390px en light/dark and 360px en light): app positioning defect, not switch-back.** These cases actually fail at `top-bar.spec.ts:141`, before any language selection. The 390px trace records a 299.1875px trigger and a rounded Popper translation of x=75px, reaching x=374.1875 instead of staying within x=374. The screenshot confirms the menu is at the right gutter. Shared `SelectContent` now requests 17px collision padding, leaving one pixel for Popper coordinate rounding while preserving the required minimum 16px gutter. Existing strict shared layout checks and screenshots remain unchanged; no tolerance or exclusion was added.
- **LanguageMenu autofocus investigation:** tried Radix's entry-focus and opening-autofocus hooks. Runtime tests passed with entry-focus, but the installed DropdownMenu explicitly omits `onEntryFocus` from its public props; `onOpenAutoFocus` is also excluded by the underlying Menu's private-prop boundary. Opening-autofocus alone additionally reproduced both existing pointer-exit keyboard failures (two failed / six passed). Removed both experiments rather than cast through unsupported APIs or lose pointer-exit behaviour. `LanguageMenu` is unchanged; its existing guarded focus redirect and behaviour tests remain, with round-trip coverage strengthened.

Checks actually run (all pnpm commands use `--config.verify-deps-before-run=false`):

- `pnpm --filter @stintwork/web test --configLoader native src/TopBar.test.tsx` — baseline with the extended nested round-trip checks: exit 0, six passed. Opening-autofocus-only experiment: exit 1, two failed / six passed; those failures protected pointer-exit behaviour.
- `pnpm --filter @stintwork/web test --configLoader native src/TopBar.test.tsx src/ui/Select.test.tsx` — initial entry-focus experiment: exit 0, eight passed; later expanded pointer/round-trip coverage: exit 0, ten passed.
- `pnpm typecheck` — two experimental runs exited 2 because entry-focus and opening-autofocus respectively are not supported DropdownMenu props; removed the experiments. Final run exited 0, passing root and all six packages.
- `pnpm --filter @stintwork/web test --configLoader native` — final source: exit 0, 47 files / 510 tests passed (also ran during the experiments).
- `pnpm exec biome format --write packages/web/src/TopBar.test.tsx packages/web/src/i18n/LanguageMenu.tsx packages/web/src/ui/Select.tsx packages/web/e2e/top-bar.spec.ts packages/web/e2e/drawer-and-needs-you.spec.ts` — exit 0, five files checked / one formatted. Subsequent targeted LanguageMenu formatting exited 0 with no fixes.
- `pnpm format:check` — final run exit 0, 335 files checked / no fixes.
- `pnpm lint` — final run exit 0, licence checks passed; 336 files checked / existing Biome migration information only.
- `pnpm --filter @stintwork/web exec vite build --configLoader native` — final run exit 0; existing non-fatal dependency `use client` and greater-than-500kB chunk warnings.
- `pnpm --filter @stintwork/web exec playwright test --list` — exit 0, 174 cases in six files discovered only; not executed.
- `git diff --check` — exit 0.

Changed in this follow-up: `src/TopBar.test.tsx`, `src/ui/Select.tsx`, `e2e/drawer-and-needs-you.spec.ts`, `e2e/top-bar.spec.ts` (under `packages/web/`), and this Comments entry. No browser/server test execution or new screenshots locally: ticket 05 still needs the coordinator's full browser rerun and required visual review. Ticket 06's exhaustive state matrix and revision-linked screenshot/CI evidence remain unchanged. Status and acceptance checkboxes are unchanged; no new file, dependency, frontend-guide change, commit or push.
