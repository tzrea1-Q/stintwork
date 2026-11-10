# 04 — Antigravity resume and cancel

Status: resolved
Blocked by: 01, 02, 03

## What to build

Use the M10 restart path and its ownership and permission safeguards for Antigravity if the probe proves new-process recovery. Continue the same session without replaying the brief or stage skill; record whether the server itself replays history. If recovery is unproven or fails, use the documented interrupted/checkpoint fallback and require a developer-started new stint. Cancel must stop the agent and clear pending requests safely. For M12, use the checkpoint fallback; native restart is deferred to [ticket 07](07-antigravity-native-restart.md).

## Acceptance criteria

- [x] Fake-agent tests cover cancellation, restart and the fallback, including a pending permission request and failed recovery.
- [x] The documented behavior matches ticket 01's recorded evidence and does not assume disputed history behavior.

## Comments

**Partial work, 2026-11-09:** Bounded Antigravity availability's version probe to 5 seconds, with a localized timeout reason and a test that a later refresh clears it. Grok's detector in this checkout does not run a version probe; its 60-second probe is in explicit preparation. Changed `packages/agents/src/antigravity.ts`, `packages/agents/src/antigravity.test.ts`, `packages/core/src/core-text.ts`, and `packages/web/src/i18n/zh-CN.ts`. The native restart path is not implemented: its process ownership marker and recorded launch format currently cover adapters, not `agy`. The existing fallback remains in place. Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and the focused Antigravity suite (16 tests) passed. The agents/core/web suite passed 2,210 tests and failed 9 adapter-cache tests because native process inspection was denied; `ps` independently returned operation not permitted. Coordinator must rerun outside the sandbox. Acceptance criteria remain open.


**Continued work, 2026-11-09:** `packages/core/src/permission-levels.ts` recognizes Antigravity's `CommandLine` for the existing safe-command policy and rejects ambiguous command fields. `packages/core/src/safe-commands.test.ts` covers safe, unsafe, unknown and conflicting commands. `packages/web/src/BriefPreview.tsx`, `packages/web/src/BriefPreview.test.tsx`, `packages/web/src/i18n/en.ts`, `packages/web/src/i18n/zh-CN.ts`, and `packages/web/src/i18n/catalog.test.ts` show the selected native agent's name and exercise both experimental agents in English and Chinese. The current source already had the experimental badges. Focused tests passed (295); format, lint, typecheck, and `git diff --check` passed. The broader unit run is reported below. Native restart recovery remains unimplemented; the checkpoint fallback remains in effect, and the requested recovery fake-agent tests are still needed. Criteria remain open. Browser layout checks and coordinator visual review remain outstanding.

**Unit run, 2026-11-09:** `pnpm exec vitest run packages/agents/src packages/core/src packages/web/src` passed 2,214 tests and failed 9 in `packages/agents/src/adapter-cache.test.ts`: the sandbox denied native process-table inspection required for ownership cleanup. The coordinator must rerun these outside the sandbox. An additional combined run including server tests was interrupted; it is not a completed check.

**Coordinator scope decision, 2026-11-09:** M12 uses the documented checkpoint fallback on server restart. Native new-process `session/resume` requires the M10 ownership marker and launch record to cover native installed executables; this is deferred to ticket 07, outside the M12 exit.

**Review evidence, 2026-11-09:** `packages/agents/src/antigravity.test.ts` exercises cancellation and the shared launcher's SIGTERM-to-SIGKILL escalation. `packages/server/src/stop-and-failure.test.ts` verifies that Stop cancels the pending Antigravity permission, rejects a late allow, and clears attention. `packages/server/src/stint-history.test.ts` checks experimental checkpoint fallback, no recovery launch or prompt, and a developer-started new stint, including a previously failed recovery record; its existing failed recovery tests exercise actual failed setup and checkpoint cleanup for the shared recovery path. Antigravity itself deliberately makes no native recovery attempt in M12. Documentation changes are in `README.md`, `README.zh-CN.md`, `docs/getting-started.md`, and `packages/agents/profiles/README.md`; ticket 07 records native restart scope and ticket 01 live evidence. Earlier changes and checks are recorded above.

Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed. Focused Antigravity stop, SIGKILL and recovery cases passed. The combined agents/core/web/server unit run was interrupted after sandbox-denied tests stalled; sandbox-denied process inspection causes the nine `packages/agents/src/adapter-cache.test.ts` failures, and tests requiring `ps` or TCP listen must be rerun outside the sandbox by the coordinator. The complete focused run `pnpm exec vitest run packages/server/src/stop-and-failure.test.ts packages/agents/src/antigravity.test.ts` passed 25 tests and failed the existing WebSocket Stop case on `listen EPERM: 127.0.0.1`; rerun both files outside the sandbox.

**Unit rerun, 2026-11-09:** `pnpm exec vitest run packages/agents/src packages/core/src packages/web/src` completed: 2,214 passed and 9 failed, all in `packages/agents/src/adapter-cache.test.ts` because native process inspection was denied. Coordinator: rerun this command and `pnpm exec vitest run packages/server/src` outside the sandbox; also rerun the focused server cases and WebSocket Stop test there.

**Coordinator, 2026-11-10:** Verified outside the sandbox: format, lint, typecheck, build, 3,357 unit tests (including the adapter-cache and listen tests that the sandbox blocked), package smoke and 432 browser tests pass. The Codex review found no defects. Native resume is deferred to ticket 07 under the scope decision above. Merged.
