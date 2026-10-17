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
