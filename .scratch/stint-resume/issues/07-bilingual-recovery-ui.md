# 07 — Show recovery and fallback in both languages

Status: resolved
Blocked by: 06

## What to build

Finish the spec's recovery copy and state presentation across Pipeline/work-item drawer, Needs you, active stream and stint history. Keep the existing running lifecycle with a recovery phase and the same stint identity. Show Resuming stint / 正在恢复 Stint, reconnecting versus answerable permission, resumed marker, concrete fallback/checkpoint failure and existing Start new stint action. Use the spec's English/Chinese copy table and glossary; keep agent-authored content unchanged.

Expose recorded source/executable/version/adapter and recovery reason through existing details. Stop remains available during load; Start and conflicting mutations cannot act on a recovering stint. History replay is read-only, and WebSocket reconnect/snapshot refresh must not duplicate or lose events/attention. Recovery success alone adds no attention item. Use existing CoreText/i18n, components and tokens under `docs/agents/frontend.md`; no new settings, Resume control or parallel view.

Add focused behaviour and browser cases to the existing harness, including slow loading, long paths/reasons, permission controls, Stop and fallback. Save review screenshots rather than pixel baselines.

## Acceptance criteria

- [ ] All specified states, errors and accessible labels exist in `en`/`zh-CN`, using glossary terms and unchanged agent-authored option/content text.
- [ ] Drawer, queue, stream and history agree on the same stint/recovery state and source details, including checkpoint failure and legacy/Grok fallback reasons.
- [ ] Resuming has usable Stop and blocked conflicting actions; permission reconnecting/answering states and terminal replay expose only valid actions.
- [ ] Snapshot/WebSocket reconnection keeps one event history and one logical permission; no spurious recovery-success attention item appears.
- [ ] jsdom behaviour checks cover actions, keyboard/focus and loading/error/long-content states with shared components/tokens.
- [ ] Coordinator-run browser cases pass at 1440/1024/768/390px in both languages, support 360px, and cover light/dark at 1440/390px where styling changes; screenshots are retained.
- [ ] Comments record actual checks and coordinator screen review at 1440/390px in both languages, with missing browser/socket resources explicit.

## Comments

**Codex, 2026-10-26:** Local jsdom/catalog checks do not require real agents or provider network. Browser/screenshots, HTTP/WebSocket checks and real-agent UI acceptance are coordinator-run. This ticket supplies UI evidence, not the M10 exit verdict.

**Codex, 2026-10-26 — ticket 07 implementation:** Implemented uncommitted on `codex/m10-07`, based on `2ce2bd3`. No `Status:` line or acceptance checkbox changed. No commit, browser execution, screenshots, real socket or real-agent pass is claimed.

- Added one shared recovery presentation to the existing drawer/active stream, Needs you permission entries and stint history, with Pipeline recovery labels. Both catalogs cover suspending/suspended/resuming/resumed/fallback, the exact spec's resumed marker and fallback/checkpoint-failure copy, Stop stint and Start new stint. Recovery details expose the recorded Installed/Bundled source, selection reason, executable/version, adapter entry/version, worktree and concrete recovery diagnostics. Known legacy/Grok/old-ownership-metadata explanations use CoreText; unknown provider/process diagnostics and all agent-authored messages, option names and details stay intact. A clean fallback with no new commit does not claim checkpoint failure. Failed recovery uses its one recovery explanation rather than duplicating the generic error banner.
- Stop remains usable during recovery. Start, agent changes and gate approval retain their active-stint guards; checks and Review write controls now also disable while the work item has an active stint. Read-only Review browsing remains available. Permission controls continue to use the server's live/reconnecting binding and current attemptId, including non-owner projection, answering and delivery errors. No Resume control, settings or parallel view was added.
- Ownership/cleanup warnings now carry additive CoreText metadata without changing their original English diagnostic or server lifecycle; Needs you renders translated guidance as a project warning. Successful recovery creates no attention item. Open history replay refreshes when recovery phase changes, with uncached recovery reads, and remains read-only. Fixed the existing Stop/stream sibling React key collision. Reconnect regressions retain a single event history and logical permission with original age, reject duplicate frames and leave zero attention after permission delivery.
- Test-first slices reproduced missing recovery presentation, enabled checks/Review writes, absent queue source details and stale open-history phase before their fixes. `Recovery.test.tsx` has 20 bilingual cases; the existing snapshot suite adds one reconnection case. Existing permission, keyboard/focus, error, catalog and history suites remain enabled. New tests reuse the existing jsdom/Vitest and Playwright harnesses and shared components/tokens; no dependencies or pixel baselines.

Actual final local checks:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run packages/web packages/core --configLoader native
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts --configLoader native --testNamePattern='^(?![\s\S]*(?:TCP: true|failed recovery |saved handoff phase|saved findings phase|slow startup leaves|fallback checkpoint errors|graceful suspension keeps))'
NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false exec playwright test stint-recovery.spec.ts --list
git diff --check
```

All final commands passed: format checked 393 files; lint checked 345 licence headers / 394 Biome files with only the existing informational configuration deprecation; workspace typecheck passed; web/core passed **88 files / 1,600 tests**; socketless history passed **86 tests / 44 skipped**. Playwright **listed 20 cases**, without executing a browser. Logs: `/tmp/m10-07-{format,lint,typecheck,web-core,server,e2e-list}.log`; focused final history/recovery: `/tmp/m10-07-final-recovery.log` (28/28 passed). Early red/failed invocations are not counted as passes; the existing exact-request history test caught the added cache option, so legacy requests retain their original options while recovery reads use `no-store`. Ignored dependency links were redirected locally from the main checkout to this worktree's workspace sources, reusing external dependencies without downloads or main-checkout edits.

Coordinator — browser/layout checks **still required**, because this sandbox has no browser, sockets or network:

```sh
pnpm --config.verify-deps-before-run=false build
NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false exec playwright test stint-recovery.spec.ts
pnpm --config.verify-deps-before-run=false test:e2e
```

The new file has 14 layout journeys: 1440/1024/768/390/360px in en and zh-CN, with light/dark at 1440/390px; plus bilingual Stop, permission delivery/error and conflicting Review cases. Journeys cover slow recovery, long source paths/reasons, Pipeline/drawer/queue consistency, reconnecting/non-owner versus answerable permission, duplicate snapshot delivery and browser WebSocket reconnection, no success attention, history loading/error/retry/read-only replay, legacy/Grok checkpoint fallback and checkpoint failure. Review keyboard opening, native disclosure Enter, Escape and focus return. Layout assertions check page overflow, clipping and 16px overlay gutters.

**Review screenshot output:** `packages/web/coverage/e2e/test-results/<test-case>/stint-recovery-review/*.png`, created by the cases on the coordinator host. Names identify Pipeline, slow load, source details, reconnecting/live queue, resumed stream, history states, cleanup warning, fallback/checkpoint failure, Stop, answering/error and blocked Review controls. These are review artifacts, not pixel baselines. No screenshots were generated here. The coordinator must review the changed screens at **1440 and 390px in both languages**, record the actual result and retain the artifacts before merging; also run the complete matrix above, including the 360px minimum.

Coordinator — **real HTTP/WebSocket/native checks still required**, without filters:

```sh
pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts packages/server/src/stint-permissions.test.ts packages/server/src/stints.test.ts packages/server/src/stop-and-failure.test.ts packages/server/src/checkpoint-handoff.test.ts --configLoader native
```

The 44 deferred history cases comprise all 24 native server-only SIGKILL cases, all 13 failed-recovery variants, saved handoff/findings recovery, both slow-startup transport cases, legacy TCP SIGKILL fallback, failed-resume checkpoint errors and graceful suspension/continuation. Require native cases to execute, not silently skip. The other named suites supply actual HTTP/current-attempt permission delivery, two-tab snapshots, durable event ordering, Stop during work and checkpoint/handoff WebSocket evidence. Reconnect two real browser tabs during recovery: confirm one history, one logical permission with original age, only the callback owner can answer in queue and drawer, Stop during load, blocked conflicting mutations, fallback cleanup/checkpoint reasons, and zero recovery-success attention. Route-mocked Playwright and jsdom checks do not replace those sockets. Real authenticated Claude/Codex restart/permission evidence and the M10 exit remain tickets 08/09 and coordinator acceptance.

**Codex, 2026-10-26 — coordinator failures and first-review fixes:** Follow-up from `ad6b87b` in `~/Develop/stintwork` on `codex/m10-07`. Uncommitted; no `Status:` line or acceptance checkbox changed. Opened all three supplied failure screenshots. The coordinator's native format/lint/typecheck/build/smoke and 318 other e2e passes are preceding-revision evidence; no new browser or native-socket pass is claimed here.

- **Warning regression explained and reproduced:** The unchanged brief-preview test failed locally too. Its failure output contains the original recovery diagnostic as the third warning, alongside the two Git warnings, with additive `messageMessage: {code: "recovery.blocked", params: {detail: ...}}`. `.toContainEqual({path, message})` compares the entire object and therefore rejects this translated wire form. No warning was dropped by the product. Updated the assertion to `objectContaining` while retaining the exact original path/message checks and explicitly requiring the recovery CoreText metadata. The typed 409, usable health/history and running reservation checks remain. The single regression then passed; the entire unchanged-behaviour brief-preview file passed 9/9. Red evidence: `/tmp/m10-07-followup-server-red.log`; green: `/tmp/m10-07-followup-server-green.log` and `/tmp/m10-07-followup-brief-preview.log`.
- **Active presentation and visual fixes:** Recovery remains inside the active stint's `StintStream`. Moved the complete active stint section before the planning/gate sections so its heading, Stop and recovery state lead the scrollable drawer content. The original screenshots showed the lower active content after scrolling to its disclosure; the test's `filter({has: details})` also reused a fully scoped locator as a relative descendant selector. Kept the structural assertion and corrected it to the active stream's direct recovery disclosure. Added a token-styled recovery container, a block badge wrapper and explicit body margin/insets/row spacing so the focus ring has clearance. Browser cases now require the active heading and complete badge to be in the viewport, including after expansion, and measure at least 8px between summary/body and at the body inset. These geometry checks still need coordinator execution.
- **Risk fixture:** The old blob ID `"blob"` fails the real `isRiskyPaths` snapshot validator, so the live fixture snapshot was rejected and the Review had no risky-paths section. Configure the risk before the first browser snapshot with a valid 40-character blob identity, return a matching synthetic `secret.env` diff file, require the risk section/path to exist, then assert Accept is disabled. Subsequent fixture publication also checks risky-path validity. This preserves the disabled-control assertion rather than replacing it with a missing-control assertion.
- **Review P2s:** In-progress recovery labels now require a running stint; a stopped ending cannot keep a resuming badge. An actually recorded resumed marker survives terminal completion. Recovery summaries now carry the stint log's recorded worktree, and collapsed history no longer accepts the current work-item path as a substitute. Old summaries lacking that field use localized checkpoint-failure copy without inventing a location; opening their existing replay fetches the recorded path. Snapshot validation checks the optional worktree structure. No new endpoint or parallel state was added.
- **Regression/diagnostics:** Eight added bilingual jsdom cases reproduced terminal-state, section-order and replacement-worktree failures before fixing them, and cover older summaries with no path. `Recovery.test.tsx` now has 28 cases. Failed recovery browser cases attach `recovery-fixture.json` and `recovery-dom.html` alongside Playwright's existing failure screenshot/trace. Assertion messages distinguish wrong stream ownership, invalid risky-path data, clipped badges and disclosure geometry. Review screenshots retain the existing `stint-recovery-review/` output directory; no new screenshots were generated locally.

Actual final local validation:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run packages/web packages/core --configLoader native
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run packages/server/src/brief-preview.test.ts --configLoader native
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts packages/server/src/brief-preview.test.ts packages/server/src/finding-decisions.test.ts --configLoader native --testNamePattern='^(?![\s\S]*(?:TCP: true|failed recovery |saved handoff phase|saved findings phase|slow startup leaves|fallback checkpoint errors|graceful suspension keeps))'
NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false exec playwright test stint-recovery.spec.ts --list
git diff --check
```

Final groups passed: web/core **88 files / 1,608 tests**; all brief-preview **9/9**; the three selected server files **114 passed / 44 native-or-socket cases skipped**. Format/lint/workspace typecheck passed, with only the existing informational Biome configuration notice. All **20** recovery Playwright cases listed; listing is not browser execution. Logs: `/tmp/m10-07-followup-{format,lint,typecheck,web-core,brief-preview,server,e2e-list}.log`. The initial six failing UI regressions are in `/tmp/m10-07-followup-ui-red.log`; no red/failed run is counted as passing. The final append-only ticket/Status and whitespace guards also passed.

Coordinator: rebuild this delta, rerun `stint-recovery.spec.ts` (all 20 cases), then the complete e2e suite and unfiltered native unit suite. The 44 deferred history cases remain the native/socket cases enumerated in the preceding note; they were not newly passed here. Recheck the supplied 1440px zh-CN and 390px en failure states, all requested widths/languages/themes, and actual keyboard focus/scroll behavior. Retain review PNGs under `packages/web/coverage/e2e/test-results/<test-case>/stint-recovery-review/`, with failure DOM/fixture attachments if any assertion recurs. Record the coordinator's actual 1440/390px screen review in both languages before accepting the visuals.

**Codex, 2026-10-26 — path assertions and stage-stint header:** Follow-up from `51c4df2` on `codex/m10-07` in the main checkout. No commit, `Status:` or acceptance-checkbox changes. Opened the supplied 1440px en / 390px zh-CN failure screenshots and their saved `slow-load-reconnecting.png` review shots. The coordinator's 2730 unit / smoke / clean review / 320 e2e passes belong to the preceding revision; this delta still needs native browser execution.

- Traced the third path to `PermissionDetails`: the restored request's `rawInput.cwd` is rendered in its permission section. The other two occurrences are the recorded worktree and selected executable in recovery details. They describe separate facts, so no product content or agent-authored permission details were removed. Replaced the raw occurrence count with exact assertions on the definitions paired with the Worktree and Executable labels. A bilingual jsdom regression also verifies those labelled fields and the permission cwd remain in their respective contexts.
- Fixed the live header to use the registered Agent `displayName`, falling back to its ID, and omit the ticket segment for a stage stint with `ticket: null`. Reused the same resolved Agent profile for the stream. Both-language browser cases now assert the exact stage-stint header (`Codex · running` / `Codex · 进行中`). Bilingual jsdom regressions cover a custom registered display name, null ticket, ticket 7 and missing-profile ID fallback. The header tests reproduced `codex · Ticket null` / `codex · 工单 null` before the fix.
- Checked every `t.stints.ticket` caller: history already guards null; the live header was the only unsafe caller. The Needs you ticket formatter is also already guarded. Narrowed the stint ticket formatter's argument to `number` in both catalogs so future nullable callers fail typecheck. No new copy, settings or UI abstraction was added.

Actual checks run:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run packages/web packages/core --configLoader native
pnpm --config.verify-deps-before-run=false vitest run packages/web/src/Recovery.test.tsx --configLoader native
NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false exec playwright test stint-recovery.spec.ts --list
git diff --check
```

Final checks passed: format, lint (existing informational Biome configuration notice only), workspace typecheck; **88 web/core files / 1,612 tests**; final focused recovery **32/32**. All **20** recovery Playwright cases list successfully, without browser execution. Logs: `/tmp/m10-07-path-header-{format,lint,typecheck,web-core,e2e-list}.log`; red header reproduction: `/tmp/m10-07-header-red.log`; final focused run: `/tmp/m10-07-header-green.log`. An initial typecheck caught a Testing Library option that only Playwright supports; it was removed and final typecheck/focused tests passed. No failed run is counted as a pass. Append-only ticket, Status-preservation and whitespace guards passed.

Coordinator: rebuild this delta, run all 20 `stint-recovery.spec.ts` cases and the full e2e suite, and retain the existing width/language/theme screenshots under `packages/web/coverage/e2e/test-results/<test-case>/stint-recovery-review/`. The prior fixture/DOM failure attachments remain enabled. Confirm the complete journeys now get past the labelled-field assertions and the header contains the registered Agent name with no null ticket in either language. No new screenshots, browser, socket, build or smoke pass is claimed locally.

**Coordinator, 2026-10-26:** Verified on the native host (darwin-arm64, Chromium via the Playwright harness).

- **Checks:** format:check, lint, typecheck, build, 2734 unit tests, smoke:package and all 334 e2e tests pass. The e2e run includes the 20 stint-recovery cases at 1440/1024/768/390/360px in both languages, plus light and dark at 1440 and 390px.
- **Reviews:** three Codex reviews. The first review's findings were fixed (terminal history no longer shows "Resuming…"; history keeps the recorded worktree), and the second and third were clean.
- **Screenshots:** 204 retained (coordinator scratch copy: `m10-07-screens/`).

**Screen review at 1440/390px in en and zh-CN:**

- **Live stint:** recovery sits in the drawer's live-stint section, next to Stop. The resuming badge is visible and the disclosures are spaced.
- **Needs you:** the reconnecting item keeps its original wait time, with disabled answer buttons and "正在重新连接权限请求…".
- **Fallbacks:** the Grok, legacy and checkpoint-failure reasons are localized, and long paths and reasons wrap.
- **Stop:** during resuming, Stop shows "Stopping stint…".
- **Resumed marker:** green.
- **Cleanup-blocked warning:** shown under Project warnings, with its details.
- **Review overlay:** during recovery, Accept, Send back and Run checks are disabled.

**Host defects fixed:**

- The recovery panel rendered outside the live-stint section, with a clipped badge and overlapping summary.
- A pre-existing header bug on main: "codex · Ticket null" now shows the agent's display name and omits the missing ticket.
- A fixture produced no risky path to exercise.

**Not changed (follow-ups, both pre-existing on main):**

- Stint history still shows the raw agent ID (`grok`), and English history shows raw ISO timestamps.
- At 390px the live-stint heading sits tight against the tab strip.

**Left to ticket 09:** WebSocket reconnect and ownership are covered by the mocked e2e harness; real-agent UI acceptance happens in ticket 09's exit run. Resolved.
