# 05 — Document agent support

Status: resolved
Blocked by: 02, 03, 04

## What to build

Update the English and Chinese README and relevant agent setup documentation: list Antigravity CLI as experimental with its official install link, version floor, sign-in and recovery guidance. State Grok Build's actual end-to-end verification status from agent-polish 04. Keep the developer's login and credential boundary clear.

## Acceptance criteria

- [x] Both README files and relevant docs agree with the implemented and observed behavior; links and formatting are checked.
- [x] Antigravity stays experimental until the M12 exit; Grok's status is not claimed verified before its evidence exists.

## Comments

**Partial work, 2026-11-09:** Updated `README.md`, `README.zh-CN.md`, `docs/getting-started.md`, and `packages/agents/profiles/README.md` with installation, sign-in, permissions, current checkpoint fallback, and Grok probe and rate-limit evidence. These describe the current fallback and must be updated once ticket 04 implements recovery. Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed; agents/core/web unit run passed 2,210 tests and failed 9 adapter-cache tests because process inspection was denied (ticket 04). The official install link was supplied by the task; no live link check was performed. Acceptance criteria remain open.


**Continued work, 2026-11-09:** The existing documentation changes remain in `README.md`, `README.zh-CN.md`, `docs/getting-started.md`, and `packages/agents/profiles/README.md`; they still describe the implemented checkpoint fallback. Do not claim native recovery until ticket 04 implements and verifies it. The official install link has not been checked live. Criteria remain open. Format, lint, typecheck, and `git diff --check` passed; focused permission and preview tests passed (295). Broader unit run is reported in ticket 04.

**Unit run, 2026-11-09:** `pnpm exec vitest run packages/agents/src packages/core/src packages/web/src` passed 2,214 tests and failed 9 in `packages/agents/src/adapter-cache.test.ts`: the sandbox denied native process-table inspection required for ownership cleanup. The coordinator must rerun these outside the sandbox. An additional combined run including server tests was interrupted; it is not a completed check.

**Review evidence, 2026-11-09:** Updated `README.md`, `README.zh-CN.md`, `docs/getting-started.md`, and `packages/agents/profiles/README.md` with default-mode per-level approvals and safe in-worktree shell commands, 1.5.3 floor, developer sign-in, checkpoint fallback and planned native resume, and Grok's unverified rate-limited status. The existing official `https://antigravity.google/cli` URL was checked with the web fetcher: it returned shell-script content, which the fetcher does not render; Google's official getting-started page lists the platform-specific installers. Direct `curl` could not resolve DNS inside the sandbox. Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed. The combined agents/core/web/server unit run was interrupted after sandbox-denied tests stalled; sandbox process inspection failures require a coordinator rerun outside the sandbox (ticket 04).

**Unit rerun, 2026-11-09:** `pnpm exec vitest run packages/agents/src packages/core/src packages/web/src` completed: 2,214 passed and 9 failed, all in `packages/agents/src/adapter-cache.test.ts` because native process inspection was denied. Coordinator: rerun this command and `pnpm exec vitest run packages/server/src` outside the sandbox; also rerun the focused server cases and WebSocket Stop test there.

**Coordinator, 2026-11-10:** Verified outside the sandbox: format, lint, typecheck, build, 3,357 unit tests (including the adapter-cache and listen tests that the sandbox blocked), package smoke and 432 browser tests pass. The Codex review found no defects. Native resume is deferred to ticket 07 under the scope decision above. Merged.
