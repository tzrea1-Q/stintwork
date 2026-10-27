# 07 — Show recovery and fallback in both languages

Status: ready-for-agent
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
