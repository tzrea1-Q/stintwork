# 06 — Cover cache, offline and interruption behavior

Status: resolved
Blocked by: 04, 05

## What to build

Add focused fixture-driven coverage at the existing preparation, launcher, server and UI seams. Do not use or clear the developer's real caches or write their login/configuration. Test both proven-compatible installed-CLI selection and pinned bundled fallback for missing, incompatible or unverified installed versions.

Exercise warm cross-project reuse, offline cold misses, corrupt/incomplete entries, integrity/registry errors, cancellation or process termination during preparation, stale/concurrent preparation, explicit retry and CLI-version changes. Count requested packages so compatible paths fetch no native payload and fallback paths fetch only the selected agent's pinned host-native package. Test a cached adapter whose bundled native package is still absent: offline fallback preparation must fail clearly rather than claim ready or run partial content. Local preparation success offline is not proof of provider-backed inference offline.

Also cover missing/mismatched released locks and integrity data, disabled install scripts/no unrecorded fetches, unsafe cache ownership, symlink escapes, shared writable entries, post-install file corruption, timeout and disk-full cleanup. Verify only the failed attempt's staging is removed, stale ownership is reclaimed only once its process is gone, and concurrent callers reuse one verified publication. Keep package completion separate from login readiness; authentication/permission/provider failures must not trigger source switching. Check read-only board inspection, honest untested/not-prepared states and pre-download source/cancellation UI, without credential data entering cache entries or logs.

## Acceptance criteria

- [ ] Warm cross-project/root-version reuse performs no package downloads and preserves recorded pins and executable selection.
- [ ] Compatible installed paths request zero native payloads; missing/incompatible/unverified paths request only their selected pinned bundled fallback and expose the reason.
- [ ] Offline warm/cold tests cover both paths, including an adapter cached without its required fallback native package, with honest readiness/errors.
- [ ] Corrupt entries, integrity/registry failures, cancellation/kill, stale and concurrent preparation never launch partial content or replace a previous good entry.
- [ ] Explicit retry recovers with unchanged pins; CLI identity/version changes trigger reselection and do not silently reuse an incompatible installed executable.
- [ ] Board/availability requests never prepare/download agents; changed UI states show source/reason, progress and retry without blocking board use.
- [ ] Tests assert no project/global CLI/credential writes; real-repo tracker assertions cover only parsing, no warnings and dependency order, not fixed counts/statuses.

## Comments

**Codex, 2026-10-17:** Added fixture-driven adversarial coverage at the existing cache, launcher, availability, server and browser seams. No Status lines or acceptance boxes changed; no commit. All new package/agent failures use fake npm, fake ACP agents and temporary cache/project/home directories. The existing real-npm regression remains strictly offline with local fixture tarballs and an isolated cache. No developer cache, global npm configuration, CLI installation or login was changed.

Coverage added or strengthened:

- Installed and bundled warm reuse crosses projects/root package versions without npm, retaining pins and executable selection; both cached bundled selections also reach the real launcher seam with fake ACP.
- Cold offline installed/bundled misses return actionable errors and retry the identical lock/cache key; installed-only cached adapters cannot satisfy an offline native fallback for either agent.
- Package request counts prove no native payload for compatible installed selection and exactly the selected pinned host-native payload for missing, below-range, incompatible or unparseable CLI selection; frozen `ci`, disabled scripts, omitted optionals, empty private npmrc files and stripped npm configuration are asserted.
- Integrity/registry and disk-full failures, modified locks, wrong installed versions, missing native packages and escaped symlinks cannot publish; retry retains pins and prior good entries, unrelated abandoned staging and retry downloads.
- A controlled deadline fires only after fake npm's startup marker; cancellation/timeout remove only the current staging/owner. A real preparing process is killed after npm starts; its dead lock is reclaimed, its abandoned staging remains ignored, and retry publishes once. Existing two-process coverage proves a single installation/publication; an old living owner cannot be stolen.
- Missing/mismatched manifest/lock/root pins/artifacts/integrity fail before npm. Incomplete published entries fail before smoke; post-install corruption/shared writes, unsafe ownership and symlinked cache directories fail closed without deleting targets.
- Installed and bundled executable identity changes invalidate readiness during read-only refresh without launching/preparing. Server failures leave preparation unavailable and create no worktree/log; explicit retry succeeds. Package completion remains unavailable until current-launch readiness. Existing authentication/permission/provider regressions retain the own-login/no-source-switch boundary.
- Project contents, installed CLI and fake home/config/login sentinels survive preparation/failure unchanged; cache contents exclude the credential and npm stderr sentinels. Real-repo tracker checks now assert only parsing/no warnings/dependency order, with exact count/status expectations kept in fixtures.

Coordinator findings:

- npm downloads now use owned `npm-cache/<cache-key>/` directories serialized by the existing key lock. Only successful verified publication removes that key's download cache; failures retain it for same-pin retry. Tests cover installed/bundled cleanup, failed-attempt retention, another key's pending retry, and a developer-cache sentinel. Legacy shared cache contents from earlier versions are not bulk-cleared.
- Removed the cache smoke regression's artificial 3-second preparation deadline. It already waits for ACP initialize and process closure; real npm/CLI/ACP child startup uses a documented 60-second test bound to tolerate OS scheduling under load. The separate timeout regression injects its deadline after explicit readiness, without a sleep or a larger product timeout.
- Split the browser's six-state loop into independent state cases, retaining the width/language/colour-scheme matrix, layout/screenshots, loading gate and nested keyboard/focus assertions. Screenshots disable animation. The browser timeout remains unchanged; each case does less work.
- Added a real HTTP-stream disconnect/cancellation/retry regression for the coordinator to run outside this socket-restricted sandbox; existing in-process request cancellation cases remain runnable here.

The worktree inherited ignored `node_modules` links into the main checkout. Localized only those links so workspace imports use this worktree and external dependencies remain shared; original targets are recorded in `/private/tmp/first-run-06-module-links.json`. No tracked dependency/lock/profile pin changes.

Checks run:

- `pnpm --config.verify-deps-before-run=false format:check`, `pnpm --config.verify-deps-before-run=false lint` and `pnpm --config.verify-deps-before-run=false typecheck` passed. Lint retains the existing informational Biome deprecation.
- `pnpm --config.verify-deps-before-run=false vitest run packages/agents packages/core/src/work-items.test.ts packages/web --configLoader native --maxWorkers 2` passed: 75 files / 829 tests (complete agents and web suites plus the tracker test). Existing React duplicate-key/flushSync warnings remain. The final cancellation-startup bound adjustment passed its focused regression again: 1 passed / 49 excluded by name.
- `pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stints.test.ts --configLoader native --testNamePattern '^(?!HTTP start streams|rich events and pending permission|HTTP preparation disconnect)' --maxWorkers 1` passed: 22 tests / 3 deliberately excluded socket cases. An earlier run exposed a missing availability detector in the new readiness fixture; that fixture was corrected before this passing run. No complete server/socket pass is claimed.
- `pnpm --config.verify-deps-before-run=false vitest run packages/core/src/work-items.test.ts packages/core/src/project.test.ts packages/core/src/work-items-to-tickets.test.ts --configLoader native --maxWorkers 2` passed: 3 files / 52 tests after removing all remaining inventory-specific real-repo tracker assertions.
- `NODE_OPTIONS=--conditions=development pnpm --config.verify-deps-before-run=false --dir packages/web exec playwright test agent-preparation.spec.ts --list` passed: 98 cases collected. The initial collection without development conditions could not resolve unbuilt local core exports; no browser was launched or screenshot/layout pass claimed.
- `git diff --check`, unchanged first-run Status/acceptance-box checks, and unchanged dependency-manifest/released-lock checks passed.

Changed tracked files: this ticket; `packages/agents/profiles/README.md`; `packages/agents/src/{adapter-cache.ts,adapter-cache.test.ts,codex.test.ts}`; `packages/core/src/{project.test.ts,work-items.test.ts,work-items-to-tickets.test.ts}`; `packages/server/src/stints.test.ts`; `packages/web/e2e/agent-preparation.spec.ts`.

Coordinator, run outside the sandbox:

```sh
pnpm --config.verify-deps-before-run=false vitest run packages/server --configLoader native --maxWorkers 1
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false --dir packages/web exec playwright test agent-preparation.spec.ts --workers=2
```

The server command includes the new real HTTP disconnect regression and both existing WebSocket cases excluded here. Review the browser screenshots/layout at 1440/1024/768/390/360px in en/zh-CN, light/dark at 1440/390px. Socket binding and network are unavailable here, so browser/socket execution remains pending. Real registry/native/agent-login/provider/platform checks remain ticket 07; these hermetic offline preparation tests prove neither real-agent compatibility nor offline provider inference. Build/package smoke were not rerun for this ticket. Legacy shared npm download-cache contents are retained; only newly scoped successful attempts are pruned.

**Coordinator, 2026-10-17:** Verified: format, lint, typecheck, build, unit tests (2333), smoke:package and the full browser suite pass under load average 12-17. Codex review clean. Core tracker tests were broadened to durable properties (parse, no warnings, dependency order), which AGENTS.md requires. Resolved.
