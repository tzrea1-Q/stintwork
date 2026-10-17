# 08 — Fix defects from real packed stints

Status: ready-for-agent
Blocked by: 05

## What to build

Fix four defects reported by the coordinator’s ticket 07 runs through the packed build on darwin-arm64, under the maintainer’s logins in a scratch project:

1. Bundled Claude 2.1.293 times out in the server after confirmation at “Checking the agent”, including warm retries after direct preparation succeeds in 68 s. Trace the selected executable through preparation smoke, stint-start handshake, stint launch and helpers for both agents. An inherited `CLAUDE_CODE_EXECUTABLE=/nonexistent/claude` or `CODEX_PATH=/nonexistent/codex` must never override an explicit selection. Confirm the cause from code/tests and distinguish any remaining real-agent uncertainty.
2. Before explicit start, an installed CLI that has not been version-checked must have a pending source (“Installed CLI found, checked at stint start”), without a Bundled badge or agent/version run-on. Keep board detection read-only, with no download or ACP. Explain the choice under ADR 0011 and ticket 05; follow `docs/agents/frontend.md` and both language catalogs.
3. Replace the fixed 300 s preparation/install deadline with a bounded inactivity timeout (60 s without download/install progress). Keep cancellation and the separate 60 s first-launch version/smoke allowances. A progressing large download may exceed 300 s.
4. Retry must retain the previous source selection’s version, adapter, executable and download estimate until a new selection replaces it; source changes must still discard stale metadata.

## Acceptance criteria

- [ ] Both agents’ selected executable wins over inherited bogus overrides in smoke, handshake, launch and helpers; regression checks cover cold and warm Bundled selection.
- [ ] Board/API detection reports pending source for unverified installed CLIs without executing them; both languages render source/version clearly.
- [ ] Download/install progress can continue beyond 300 s; 60 s inactivity and explicit cancellation abort and clean the failed attempt while retaining retry downloads and prior good entries.
- [ ] Retry retains selection metadata, while actual reselection replaces it.
- [ ] Format, lint, typecheck and affected agents/server/web unit checks are recorded; socket/browser and packed real-agent reruns remain explicit coordinator checks.

## Comments

**Codex, 2026-10-17:** Filed from the coordinator’s real-stint report. Installed Claude 2.1.295 and Codex 0.163.0 completed with parsed handoffs and finished checkpoints; Bundled Codex 0.159.3 completed in 181 s. Bundled Claude failed from the server with both CLI overrides set to nonexistent paths, although direct preparation published a good entry. Two progressing 113 MB downloads also hit the fixed 300 s limit. This ticket leaves every other Status line unchanged and does not pass exit ticket 09.

**Codex, 2026-10-17:** Implemented pending board source, separate unchecked-version copy in en/zh-CN, retry metadata retention and a 60 s download/install inactivity limit. Chose path/stat-only board detection, with no `--version`, ACP or download: this preserves ticket 05’s existing read-only contract and ADR 0011’s authoritative version/compatibility checks at explicit start. Compatible installed CLIs are not classified as Bundled before inspection. Source confirmation and cache verification no longer consume a fixed total deadline; first `--version` and ACP smoke retain their independent 60 s limits. The new `stallTimeoutMs` preparation option replaces `timeoutMs`. Progress is sampled from file counts, sizes and modification times in the owned staging and npm-cache trees once per second, excluding npm logs. Recursive filesystem watches were tried but failed with sandbox EPERM, so the implementation uses portable polling. Failed attempts retain retry downloads/prior good entries and release staging/locks; cancellation remains wired throughout.

Launch diagnosis: the existing `preparedAgentEnvironment` already overwrote inherited overrides in preparation smoke and the default prepared launcher. The added cold/warm Bundled regression passed before the launch changes for both agents with both overrides pointing at nonexistent paths; it now also invokes the selected fixture executable during initialize. Therefore the coordinator’s proposed inherited-override leak is **not confirmed as the cause of the real Bundled Claude failure**. Confirmed gaps were that the native-executable helpers ignored `nativeExecutable`, and server/handshake launcher boundaries did not explicitly pass the selected environment. Those now honor the selection for both agents, using the existing environment helper. Regressions cover helper selection, changed inherited environment before installed handshake, server launcher inputs, cold/warm Bundled smoke/launch and a total deadline expiring during source confirmation. The removed global 300 s timer included confirmation, cache verification and smoke, so it could abort a healthy cold or warm preparation; exact attribution of the reported warm real-Claude timeout still requires the packed rerun. No real-agent success is claimed here.

Checks actually run:

- `pnpm --config.verify-deps-before-run=false format:check`, `lint` and `typecheck` passed. Lint retains the existing informational Biome deprecation.
- Complete agents and web suites: `pnpm --config.verify-deps-before-run=false vitest run packages/agents packages/web --configLoader native --maxWorkers 2 --reporter dot` passed, 75 files / 824 tests. Existing React flushSync warnings remain. After the final progress/confirmation regressions, the focused cache/npm-progress/Codex/server run below passed again.
- Final affected node/server checks: `pnpm --config.verify-deps-before-run=false vitest run packages/agents/src/adapter-cache.test.ts packages/agents/src/npm-progress.test.ts packages/agents/src/codex.test.ts packages/server/src/stints.test.ts packages/server/src/claude-code.test.ts --configLoader native --testNamePattern '^(?!HTTP start streams|rich events and pending permission|HTTP preparation disconnect|WebSocket snapshots)' --maxWorkers 2 --reporter dot` passed, 5 files / 95 tests, with 4 socket cases explicitly excluded. The virtual-clock regressions cover progress beyond 300 s in both download/install trees, 60 s inactivity and active-install cancellation; the real fixture regression covers failed-attempt cleanup/retry downloads.
- Tracker checks passed in the initial server/core run: parsing, warnings and dependency ordering in `work-items.test.ts`, `project.test.ts` and `work-items-to-tickets.test.ts`. That combined run had 81 passing tests and one WebSocket test accidentally omitted from the exclusion, which failed at socket bind with EPERM; it is excluded in the final passing command. No full server/socket pass is claimed.
- `git diff --check`, unchanged existing Status-line guards and absence of temporary debug instrumentation passed. No commit, dependency/pin/lock change or roadmap status change. Ignored package node_modules links were localized so workspace imports/typechecks use this worktree, retaining shared external dependencies; original targets are recorded in `/private/tmp/first-run-08-module-links.json`.

Coordinator reruns:

```sh
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false smoke:package
pnpm --config.verify-deps-before-run=false vitest run packages/server --configLoader native --maxWorkers 1
NODE_OPTIONS=--conditions=development pnpm --config.verify-deps-before-run=false --dir packages/web exec playwright test agent-preparation.spec.ts --workers=2
```

Then run cold and warm real packed stints for both agents with inherited bogus overrides and Bundled selection, especially Claude 2.1.293; retain phase timings/server errors if Claude still fails. Recheck installed-source pending copy before Start, retry metadata without reselection, confirmation/cancellation, a progressing download beyond 300 s and an actual 60 s stall. Review the preparation browser matrix at 1440/1024/768/390/360px in both languages, light/dark at 1440/390px. Build/package smoke, live registry/downloads, sockets, browser/screenshots and real logins/provider stints were not rerun here. Ticket 08 remains ready-for-agent as requested, ticket 09 remains ready-for-human, and the actual Bundled Claude outcome remains an explicit coordinator verification gap.

Changed files (exit file renamed from `08-m9-exit.md`):

```text
.scratch/first-run/issues/01-install-research-spike.md
.scratch/first-run/issues/07-cold-package-real-agent-evidence.md
.scratch/first-run/issues/08-real-run-fixes.md
.scratch/first-run/issues/09-m9-exit.md
.scratch/first-run/spec.md
packages/agents/profiles/README.md
packages/agents/src/adapter-cache.test.ts
packages/agents/src/adapter-cache.ts
packages/agents/src/availability.ts
packages/agents/src/claude-code.test.ts
packages/agents/src/claude-code.ts
packages/agents/src/claude-launcher.test.ts
packages/agents/src/codex-launcher.test.ts
packages/agents/src/codex.test.ts
packages/agents/src/index.ts
packages/agents/src/npm-progress.test.ts
packages/agents/src/npm.ts
packages/agents/src/prepare-agent.ts
packages/core/src/agents.ts
packages/server/src/stints.test.ts
packages/server/src/stints.ts
packages/web/e2e/agent-preparation.spec.ts
packages/web/src/BriefPreview.test.tsx
packages/web/src/BriefPreview.tsx
packages/web/src/i18n/en.ts
packages/web/src/i18n/zh-CN.ts
```

**Codex, 2026-10-17:** Fixed the independent review’s configured-environment regression. The server no longer supplies `preparedAgentEnvironment(preparedAgent)` built from `process.env`; it passes the prepared selection to the registered launcher, which preserves its configured environment and applies the selected executable itself. Replaced the shallow server launcher-input assertion with actual child-process regressions using `createClaudeCodeAgent(env)` and `createCodexAgent({ env })`, an isolated prepared adapter and the existing fake ACP agent. Both reproduced the wrong inherited HOME before the fix and pass after it; both also assert the selected executable overrides a bogus configured override and the stint finishes. No agent launch implementation, Status line, dependency or pin changed; no commit.

Validation for this follow-up: `pnpm --config.verify-deps-before-run=false format:check`, `lint` and `typecheck` passed (existing informational Biome deprecation only). `pnpm --config.verify-deps-before-run=false vitest run packages/agents packages/server/src/stints.test.ts --configLoader native --testNamePattern '^(?!HTTP start streams|rich events and pending permission|HTTP preparation disconnect)' --maxWorkers 2 --reporter dot` passed: 23 files / 255 tests, with the three socket cases explicitly excluded. The two new regression cases were also run alone before and after the fix. `git diff --check` and the unchanged Status guard passed. Build, package smoke, browser, sockets and real agents were not rerun for this server-only follow-up; the coordinator’s earlier full-suite results remain separate evidence.
