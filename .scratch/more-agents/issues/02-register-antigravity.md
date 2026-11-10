# 02 — Register Antigravity CLI

Status: resolved
Blocked by: 01

## What to build

Register Antigravity CLI using installed `agy` on PATH and the version floor proven by ticket 01. Provide its observed capability profile and launch `agy acp` without `--dangerously-skip-permissions` or sandbox changes. Follow the existing native Grok detection and preparation flow where applicable. Show an authentication-required message directing the developer to sign in with `agy`, and setup/readiness copy in English and zh-CN. Mark it experimental.

## Acceptance criteria

- [x] Missing, unparseable and below-floor versions are clearly unavailable; a compatible installed executable is selected and launched without a bundled adapter.
- [x] Fake-process tests cover detection, version floor, launch arguments, authentication and localized readiness messages. No credentials are read.

## Comments

### Implementation evidence — 2026-11-09

- Registered PATH-only `agy acp` with stable 1.5.3 floor and 2.x rejection, prompt-free readiness, developer-owned login guidance, and experimental checkpoint fallback. `antigravity.test.ts` exercises missing, invalid, prerelease, below-floor and next-major versions, launch arguments, authentication, and an ignored SIGTERM followed by SIGKILL. Catalog tests cover English and Chinese guidance. No credentials are read.
- Files changed: `packages/agents/src/{antigravity.ts,antigravity.test.ts,authentication.ts,availability.ts,executable.ts,fake-agent.ts,index.ts,profiles.ts,profiles.test.ts,registry.ts}`, `packages/core/src/core-text.ts`, `packages/server/src/stints.ts`, `packages/web/src/{BriefPreview.tsx,StintRecovery.tsx,i18n/en.ts,i18n/zh-CN.ts,i18n/catalog.test.ts}`.
- Checks run: `pnpm format:check`, `pnpm lint`, `pnpm typecheck` passed; focused Antigravity tests 13/13 and profile/catalog tests 73/73 passed. Core and web unit suites passed 1,753 tests. Agent package suite: 449 passed, 9 adapter-cache tests failed: sandbox denies native process-table inspection (independently reproduced); the combined run was interrupted after stalling; a separate server suite produced no file results for over three minutes and was interrupted. `pnpm test:e2e` after building core and web could not start its server: `listen EPERM 127.0.0.1:4178`. Coordinator must rerun outside the sandbox, including browser review at the frontend guide's required sizes and languages.


### Review fixes — 2026-11-09

- A successful compatible `agy --version` refresh now clears cached incompatibility without changing the executable. Antigravity and Grok profiles carry an experimental flag, shown in the stage agent selector and brief readiness in English and Chinese. Antigravity login guidance comes from profile data. Package smoke now supplies a compatible `agy` and verifies all four agents without launching them.
- Checks: `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed. Focused Antigravity and selector/brief tests passed 58/58. Core unit tests passed 1,001/1,001; web unit tests passed 756/756. Combined agents/core/web run passed 2,208 and failed 9 adapter-cache tests because native process-table inspection is denied (`ps` returns EPERM). `pnpm test:e2e` could not bind 127.0.0.1:4178 (listen EPERM). Coordinator must run browser layout/review at the frontend guide's sizes and languages and `pnpm smoke:package` outside the sandbox.

**Coordinator, 2026-11-10:** Verified outside the sandbox: format, lint, typecheck, build, 3,349 unit tests, package smoke and 432 browser tests pass. Three Codex review rounds covered stale incompatibility, the experimental label, the four-agent smoke test and default mode at every level. One open P2, the detection-time version probe taking up to 60 s (shared with Grok), moves to the ticket 04 run. Merged.
