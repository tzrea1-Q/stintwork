# 13 — GitHub evidence version 2

Status: resolved
Blocked by: 07

## What to build

Adopt evidence version 2 as decided in ADR 0014 while retaining version 1 verification and fresh dependency checks.

## Acceptance criteria

- [x] ADR and spec record the decision and compatibility.
- [x] New approvals use version 2; existing version 1 approvals verify with version 1 and unknown versions are unknown.
- [x] Ticket and blocker state changes do not invalidate version 2; content and dependency identity changes do.
- [x] Fresh dependency checks remain enforced and the integrated flow permits the next unblocked ticket without reapproval.
- [x] Requested checks are run and recorded.

## Comments

**Coordinator, 2026-11-01:** Resolved. Merged to main as `bc6bd16`.

Verify on the coordinator machine: format:check, lint, typecheck, build, smoke:package and test:e2e (432) passed. Unit tests: 3,188 of 3,192 passed during the full run. The 4 failures were in unrelated stint, permission and adapter-cache tests and happened while the machine was at load average 26, from other projects' Playwright and Python jobs. All 115 tests in those 4 files passed when rerun alone. The Codex review was clean. `github-flow.test.ts` takes about 102 s unsandboxed, within its 600 s budget.

CI run 41287367009 passed: checks, both browser shards, and package-smoke on ubuntu and macOS.

**Codex, 2026-10-31:** Added ADR 0014 and updated the spec and exit dependency. New approvals and review digests use evidence v2; existing v1 approvals retain v1 verification, unknown versions project unknown, and fresh dependency checks remain in place. Added digest, projection, approval and fake-gh flow coverage, including starting #12 after #11 closes without reapproval and invalidating the approval on a body edit. Increased the flow test timeout for the slow fake-gh environment without removing assertions.

Checks run: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), `pnpm typecheck`, `pnpm vitest run packages/core/src` (1015 passed), and the requested six-file Vitest command (158 passed, flow timed out at 240 seconds). The flow test passed separately after increasing its timeout to 600 seconds: `pnpm vitest run packages/server/src/github-flow.test.ts` (1 passed, about 175 seconds).

The requested six-file Vitest command was rerun with the 600-second flow timeout and passed: 6 files, 159 tests.
