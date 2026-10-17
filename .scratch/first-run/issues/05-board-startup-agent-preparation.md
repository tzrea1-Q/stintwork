# 05 — Separate board startup from agent preparation

Status: ready-for-agent
Blocked by: 04

## What to build

Remove eager adapter production dependencies from both root and agents manifests and integrate ticket 04's preparation at explicit stint start. Update runtime resolution, packaging/build/smoke checks and installation guidance; retain the CLI/server/web/workflow package contract without assuming adapters already exist in the consumer. Follow `docs/agents/frontend.md` for web changes.

Board startup and every availability refresh must neither download adapters/native binaries nor wait for a real ACP session, including Grok's existing 60-second readiness path. Use existing readiness seams to distinguish a missing CLI, compatibility selection, an unprepared adapter, login required and preparation failure. A missing or incompatible installed Claude/Codex CLI is not a permanent unavailable state: explicit stint start selects the pinned bundled fallback. Keep authoritative deep checks at stint start.

Show preparation progress and retry at stint start. Say whether the installed CLI or bundled agent is selected and why, including when an installed CLI is absent or unverified. Do not hide the bundled fallback or treat it as a request to install/upgrade the developer's global agent. Grok remains the developer's separately installed native CLI and login.

Preserve one published npm package, Node >=22.12, bundled workspace code, built web assets and workflow YAML. Do not merely move the adapters to optionalDependencies: default npm installation still downloads them. Grok stays native `grok agent stdio`, without Stintwork installing Grok packages.

Use only read-only local detection and cached evidence on board/availability paths; never label an untested agent ready. Show “Agent source: Installed” or “Agent source: Bundled”, selected executable path/version, adapter version and reason. Show the proposed source and download before preparation, retain actual source/reason at launch, and offer cancellation as well as retry. Keep the board usable offline with an honest “not prepared” state; document that offline npx needs the root cached and that package readiness proves neither login nor offline provider inference. Authentication errors point to the developer's own login command; never invoke login automatically, edit agent configuration or read, copy, store or proxy credentials.

## Acceptance criteria

- [ ] Root and agents packaging no longer eagerly install ACP adapters/native agent payloads; the packed package has no workspace-only leakage.
- [ ] Cold board/API/availability paths make zero preparation/download requests and do not await real-agent initialization.
- [ ] Explicit stint start invokes ticket 04 for the selected agent; absent/incompatible installed versions use its pinned bundled fallback, not a blocked missing-CLI state.
- [ ] The stint-start UI shows preparation progress, installed/bundled source and reason, and actionable failure/retry or login guidance.
- [ ] Readiness and launch agree on executable selection; Grok's native launch and the developer-owned login boundary stay intact.
- [ ] Packed version/help, health/project, web assets and workflow smoke checks still pass without eager adapter-presence assertions; frontend checks cover changed states and supported languages/widths.

## Comments

**Codex, 2026-10-17:** Implemented ticket 05 without changing Status lines or acceptance boxes. Default board/availability detection only resolves local executable paths and stat identities; it never runs a CLI, prepares an adapter or starts ACP. Untested agents remain not prepared. Missing/incompatible/unverified Claude/Codex installations remain startable through the pinned bundled fallback. Cached explicit-start evidence is discarded when executable identity changes; the selected executable identity is checked again immediately before launch.

Explicit stint start calls ticket 04's preparation through the registered agent. The web start request streams NDJSON selection/progress/availability and its final result, preserving JSON responses for existing clients. The new optional `beforePrepare` callback pauses before cache/install work for source confirmation, including a second confirmation if an installed handshake selects Bundled. The existing stop route cancels version inspection, confirmation, preparation and worktree setup; retry retains the release pins. Source, reason, executable path/version and adapter version are displayed before preparation and retained in the stint log. Package preparation never marks an agent ready: only actual stint readiness does. Login failures show the developer's login command and explicit retry; no automatic login, credentials handling or global CLI/configuration writes were introduced. Grok keeps native `grok agent stdio`, with version/readiness checks only at explicit start and its selected absolute executable passed to launch.

Removed both ACP adapters from root production dependencies and moved them from agents production dependencies to agents devDependencies only. The existing `claude-launcher.test.ts` and `codex-launcher.test.ts` resolve those pinned adapter entrypoints while substituting fake processes, so both remain necessary for development tests. No new dependency or optional-dependency move. Updated the pnpm importers, build validation/copying of all 16 released profile manifests/locks, and package smoke assertions that adapters/native payloads are absent. Updated both installation guides and the profiles API handoff.

Web changes use shared Dialog, Button, SelectField and Badge components and en/zh-CN catalogs. Added jsdom progress/confirmation/cancel/retry, inspection-time cancellation, failure/login-state and focus coverage; added server/cache fake coverage. Existing readiness tests now assert read-only inspection and explicit retry. The cache cancellation fixture waits for the fake npm startup marker instead of assuming 50 ms is enough to start a child. New Playwright cases cover 1440/1024/768/390px plus 360px in en and zh-CN, light/dark at 1440/390px, loading, missing CLI, not prepared, incompatible, login required, preparation failed, ready, source notices, progress, cancel, retry and screenshots/layout assertions. Browser-local streaming fakes and fixture projects use no real agents. Playwright is intentionally not run in this socket-restricted sandbox.

Changed-file inventory:

```text
.scratch/first-run/issues/05-board-startup-agent-preparation.md
README.md
README.zh-CN.md
package.json
packages/agents/package.json
packages/agents/profiles/README.md
packages/agents/src/adapter-cache.test.ts
packages/agents/src/adapter-cache.ts
packages/agents/src/adapter-entry.test.ts
packages/agents/src/availability.ts
packages/agents/src/claude-code.test.ts
packages/agents/src/claude-code.ts
packages/agents/src/claude-launcher.test.ts
packages/agents/src/codex.test.ts
packages/agents/src/codex.ts
packages/agents/src/grok.test.ts
packages/agents/src/grok.ts
packages/agents/src/index.ts
packages/agents/src/profiles.ts
packages/agents/src/registry.ts
packages/core/src/agents.ts
packages/core/src/core-text.test.ts
packages/core/src/core-text.ts
packages/core/src/index.ts
packages/server/src/claude-code.test.ts
packages/server/src/grok.test.ts
packages/server/src/stints.test.ts
packages/server/src/stints.ts
packages/server/src/worktree-readiness.test.ts
packages/web/e2e/agent-preparation.spec.ts
packages/web/e2e/dialogs.spec.ts
packages/web/src/BriefPreview.test.tsx
packages/web/src/BriefPreview.tsx
packages/web/src/StageAgentRail.test.tsx
packages/web/src/Stints.test.tsx
packages/web/src/i18n/catalog.test.ts
packages/web/src/i18n/en.ts
packages/web/src/i18n/zh-CN.ts
pnpm-lock.yaml
scripts/build-package.mjs
scripts/package-smoke.mjs
```

Validation and limits:

- Passed `pnpm --config.verify-deps-before-run=false format:check`, `pnpm --config.verify-deps-before-run=false lint` and `pnpm --config.verify-deps-before-run=false typecheck`. Lint reports only the existing informational Biome `recommended` deprecation.
- Ran the complete agents/web suites with `--configLoader native --maxWorkers 2`: all 53 web files / 590 tests passed; agents initially exposed the 50 ms fake-npm-start race described above. After replacing that timing assumption, the complete agents suite passed: 21 files / 192 tests. The combined final agents plus changed brief/catalog run passed 23 files / 274 tests, including 25 brief and 57 catalog tests. The final catalog-only rerun after copy refinement also passed all 57 tests. No real agents were used.
- Additional core validation passed: `pnpm --config.verify-deps-before-run=false vitest run packages/core --configLoader native --maxWorkers 2` (32 files / 967 tests).
- Attempted `pnpm --config.verify-deps-before-run=false vitest run packages/server --configLoader native`; the unrestricted suite could not complete in this sandbox. A focused `index.test.ts` WebSocket test confirmed `listen EPERM: operation not permitted 127.0.0.1`. The 22 files containing no `.listen(` calls ran separately: 306 tests passed and one old worktree-stop English-text assertion failed. Updated it to assert the localized `agent.preparationCancelled` wire code, then reran that complete file: all 12 tests passed. The changed Claude/Grok/stint files passed a separate socket-name-filtered run (22 passed, 5 excluded by the filter); the three new preparation cases also passed separately, and the final authentication case passed again with its timestamp assertion. The initial broader run is not represented as an all-green full server suite.
- `pnpm --config.verify-deps-before-run=false build` passed; the final web rebuild and package bundler also passed after the copy refinement. Existing Radix `use client` and chunk-size build warnings remain.
- `pnpm --config.verify-deps-before-run=false smoke:package --offline` passed build, tarball contents, production dependency/workspace leakage and profile/lock presence checks, then stopped at consumer installation with `ERR_PNPM_NO_OFFLINE_TARBALL`: the isolated offline store lacks `@agentclientprotocol/sdk@1.7.0`. Therefore fresh installation, consumer health/project, asset serving and availability smoke remain pending. A separate extracted-tarball check passed `--version` and `--help`, proved neither adapter resolves from the packed CLI, and found all 16 released locks (44 packed files). That check linked existing production dependencies; it is not a fresh-install or network measurement.
- Grok's `--version` flag was checked against the [upstream installation README](https://github.com/xai-org/grok-build#installing-the-released-binary); the actual Grok executable was not run. The developer's real CLI versions, logins, stints, cold-install bytes/time and platform evidence remain ticket 07/coordinator checks.
- The inherited ignored `node_modules` symlinks initially resolved workspace imports to the main checkout's older types. Replaced only this worktree's ignored links with local workspace links plus links to the existing external dependencies; the main checkout/dependency contents were not changed. Prior link targets were recorded in `/private/tmp/first-run-05-module-links.json`.
- `git diff --check`, unchanged first-run Status/acceptance-line checks, unchanged released-lock checks and no-production-adapter manifest checks passed. Tickets 04/06/07 and their Status lines are unchanged. No commit or push.

Coordinator commands outside this sandbox:

```sh
pnpm --config.verify-deps-before-run=false vitest run packages/server --configLoader native
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false test:e2e
pnpm --config.verify-deps-before-run=false smoke:package
```

Run the package smoke with network or a fully populated isolated store. Playwright was not run, and no browser screenshots or layout passes are claimed. The frontend guide's coordinator review at 1440/390px in both languages remains pending; the new browser cases also cover 1024/768/360px and the required colour schemes. No ticket acceptance box or milestone is marked complete from these unperformed checks.

**Codex, 2026-10-17, coordinator review follow-up:** Fixed the smoke dependency walk to validate manifests only at installed package roots, including scoped and nested dependencies. Shipped profile manifests remain assets; smoke separately asserts all profiles/locks and download metadata are present, byte-identical and unresolved. Added a runnable `node --test scripts/package-dependencies.test.mjs` regression covering shipped profile manifests, actual eager adapters, install hooks and native modules.

Stint setup now connects the raw request signal to cancellation, checks an already-aborted signal before preparation, and removes the listener after setup. New fake-driven server cases cover disconnection during preflight, an already-aborted request and cancellation during preparation; they prove no launch and successful retry without a retained lock, with explicit worktree-mutation assertions for the early aborts. The preview clears cached readiness on every explicit start and accepts Ready only from current-start availability confirmation. Phase-only updates preserve selection metadata, including messages with only a phase; changing source discards the previous selection's metadata.

The Agent section now uses a compact source badge, executable/adapter version summary and short reason. Its executable path lives in the shared collapsed Details Disclosure/CodeBlock. Live badges and labelled indeterminate progress appear inside the Agent section; cancellation/errors remain there and the footer contains buttons. The Codex sandbox warning has its own separated area. All copy, including the missing/stale size error, has en/zh-CN entries.

Added `packages/agents/profiles/download-sizes.json`: compressed tarball totals for each of the 14 bundled host profiles, derived from all non-optional entries in the exact shipped locks. Artifact sizes came from the read-only npm cache's tarball records or cached registry `dist.size`, matched by SHA-512 integrity; no registry request or agent execution was needed. Each total carries its lock's SHA-256; build and preparation reject stale metadata. Confirmation receives the host-profile total before cache/install work (darwin-arm64 Codex: 136,113,744 bytes, shown as about 136 MB). Estimates exclude registry metadata, retries and transport overhead; warm caches may need no download. Existing manifests, pins, locks and production/dev dependency declarations are unchanged.

Updated the Playwright fake and screenshots for installed ready, bundled confirmation with size, downloading with phase, failed/retry and cancelled, across en/zh-CN at 1440/390/360px, retaining 1024/768px and light/dark coverage. Phase-only fake messages also exercise retained version metadata. Playwright/browser screenshots were not run here.

Checks actually run:

- `pnpm --config.verify-deps-before-run=false format:check`, `lint`, `typecheck`, and `build` passed. Lint retains only the existing informational Biome deprecation; build retains the existing third-party `use client`/chunk-size warnings.
- Complete agents suite plus the changed brief/catalog tests passed: 23 files / 277 tests (194 agents tests and 83 web tests). Complete web suite passed: 53 files / 591 tests. After the final copy/error refinements, the cache/core-text/brief/catalog run passed again: 4 files / 306 tests.
- `pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stints.test.ts --configLoader native --testNamePattern '^(?!HTTP start streams|rich events and pending permission)'` passed: 16 tests; the two socket cases were explicitly excluded for this sandbox. The three raw-request regressions passed. No full server/socket pass is claimed.
- `node --test scripts/package-dependencies.test.mjs` passed. After the successful normal build, a separate `npm pack --ignore-scripts` extracted-tarball check passed the actual dependency walk, all 16 profile/lock byte comparisons, absent profile node_modules, matching size metadata, and absence of resolvable ACP adapters. This was a tarball/content check, without a fresh consumer dependency installation, health/server checks or a complete `smoke:package` run.
- `git diff --check` passed. No Status line, acceptance box, ticket 04/06/07, dependency manifest or released lock was changed. No commit.

Follow-up changed files:

```text
.scratch/first-run/issues/05-board-startup-agent-preparation.md
packages/agents/profiles/README.md
packages/agents/profiles/download-sizes.json
packages/agents/src/adapter-cache.ts
packages/agents/src/adapter-cache.test.ts
packages/core/src/agents.ts
packages/core/src/core-text.ts
packages/server/src/stints.ts
packages/server/src/stints.test.ts
packages/web/src/BriefPreview.tsx
packages/web/src/BriefPreview.test.tsx
packages/web/src/i18n/en.ts
packages/web/src/i18n/zh-CN.ts
packages/web/src/i18n/catalog.test.ts
packages/web/e2e/agent-preparation.spec.ts
scripts/build-package.mjs
scripts/package-smoke.mjs
scripts/package-dependencies.mjs
scripts/package-dependencies.test.mjs
```

Coordinator reruns:

```sh
pnpm --config.verify-deps-before-run=false smoke:package
pnpm --config.verify-deps-before-run=false test:e2e
pnpm --config.verify-deps-before-run=false vitest run packages/server --configLoader native
```

Review the new screenshot artifacts at 1440/390/360px in both languages; no new screenshot/layout pass is claimed from this sandbox.

**Codex, 2026-10-17, browser review follow-up:** Scoped the long executable-path assertions to the Agent section's Details disclosure, so they cannot match the brief's separate changed-path code. The browser spec now explicitly observes listbox opening/closing while retaining the original focus-return and parent-dialog assertions.

The focus failure is an app bug, not a wrong expectation. Inspected the coordinator's 768px English trace (`agent-preparation-agent-pr-1bfc5--dismissal-and-focus-return`) and 390px Chinese trace (`agent-preparation-agent-pr-260ce--dismissal-and-focus-return`): each shows an open listbox after the picker click; after one Escape, both that listbox and Brief preview disappear, leaving the work-item drawer. The shared Select now flushes open/close state and Radix's layer refresh synchronously, reusing the existing Tooltip workaround for Radix 1.2's Escape-listener registration. This fixes all Select callers at the shared seam. Added a fast nested-select cancellation regression: it failed before the fix with the parent dialog removed and focus on body, and passes after it; the next Escape still dismisses the parent. State flushing alone still reproduced the failure, so the explicit layer refresh is retained until upstream fixes it.

Removed the full-width progress bar. Selection/confirmation show no progress indicator; actual preparation shows a labelled indeterminate open-circle spinner with `motion-safe:animate-spin`. Reduced-motion users receive a stationary open circle and the same phase text. No numeric completion value is claimed, and the indicator disappears on confirmed readiness. Existing bilingual preparation tests assert no indicator before confirmation and indeterminate semantics during downloading. Playwright now checks the same states plus actual normal/reduced-motion CSS and saves an additional reduced-motion screenshot across the existing width/language/colour-scheme matrix. No UI strings or dependencies were added.

Checks run this round:

- `pnpm --config.verify-deps-before-run=false format:check`, `lint`, and `typecheck` passed. Lint retains only the existing informational Biome deprecation.
- The affected Select/SelectField/Dialog/brief tests passed: 4 files / 38 tests. Then `pnpm --config.verify-deps-before-run=false vitest run packages/web --configLoader native --maxWorkers 2` passed the entire web suite: 53 files / 592 tests.
- `git diff --check` and unchanged Status/acceptance-line checks passed. Changes are limited to `BriefPreview.tsx`, its test, `ui/Select.tsx`, its test, `e2e/agent-preparation.spec.ts`, and these Comments. No commit; Status lines remain unchanged.

The supplied traces were inspected as recorded artifacts; no browser suite or new screenshots were run in this socket-restricted sandbox. Coordinator: rerun `pnpm --config.verify-deps-before-run=false test:e2e` (the shared Select fix also warrants the other dialog/select cases), then review preparation and reduced-motion screenshots at the required widths/languages. Build and package smoke were not rerun for these web-only changes.
