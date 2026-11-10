# 03 — Antigravity permission levels

Status: needs-review
Blocked by: 01, 02

## What to build

Map Ask, Edit freely and Autonomous to the probe-confirmed Antigravity session modes (`default`, `accept-edits`, `plan`) and permission options (`allow_once`, `reject_once`). Use the existing permission policy and preserve safe handling when capabilities differ from the research; record discrepancies rather than assuming an unsupported mapping.

## Acceptance criteria

- [x] Each permission level and unsupported or unknown option is handled safely, with manual requests reaching Needs you when needed.
- [x] Fake-agent tests cover mode selection, allow and reject, and unanswered or unexpected options.

## Comments

### Permission mapping correction — 2026-11-09

- Superseding the earlier mapping note: Ask, Edit freely and Autonomous all select `default`; neither `accept-edits` nor `plan` is selected. Antigravity's `accept-edits` can approve edits before Stintwork checks whether their paths are in the worktree. In `default`, Stintwork auto-allows proven in-worktree edits and safe commands according to the permission level; requests it cannot prove safe go to Needs you.

### Implementation evidence — 2026-11-09

- Ask selects `default`; Edit freely and Autonomous select `accept-edits`, matching the existing Claude mapping. `plan` is never selected. Stintwork continues to forward requests through Needs you and applies its existing automatic-answer policy to requests the agent sends. Antigravity's `allow`/`allow_once` and `deny`/`reject_once` are recognized; any unexpected option or kind cancels the request safely. The live probe offered no always option.
- Files changed: `packages/core/src/permission-levels.ts`, `packages/agents/src/{index.ts,profiles.ts,fake-agent.ts,antigravity.test.ts}`; registration and readiness files are listed in ticket 02.
- Checks run: focused Antigravity tests passed 13/13, covering all modes, allow, deny, unanswered cancellation, unexpected options and process teardown. `pnpm exec vitest run packages/server/src/permission-levels.test.ts` passed 9/9, including Antigravity for all levels and manual requests. `pnpm format:check`, `pnpm lint`, `pnpm typecheck` passed. Core and web unit suites passed 1,753 tests. The agent package suite passed 449 tests and failed 9 adapter-cache tests because sandbox process-table inspection is denied; the combined run stalled and was interrupted, as was a separate server suite after over three minutes without file results; coordinator must rerun outside the sandbox. Browser suite blocked on `listen EPERM` as recorded in ticket 02.


### Review fixes — 2026-11-09

- Moved Antigravity's unchanged Ask/other permission mode mapping to its typed agent profile. Focused Antigravity tests passed 14/14; the combined agents/core/web run passed 2,208 tests and failed 9 adapter-cache tests because native process-table inspection is denied in the sandbox. `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed. Core unit tests passed 1,001/1,001 and web unit tests passed 756/756.
