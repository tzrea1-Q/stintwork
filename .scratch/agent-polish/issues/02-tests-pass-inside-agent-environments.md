# 02 — Tests pass inside agent environments

Status: resolved
Blocked by: none

## What to build

Both agents in the M3 exit test reported that `pnpm test` doesn't pass inside their stint. `claude-launcher.test.ts` fails whenever `CLAUDE_CODE_EXECUTABLE` is set, which is always the case inside a Claude Code session, and Codex saw the default run stall. Agents working on Stintwork through Stintwork must be able to run the suite. Make the agent tests independent of agent-related environment variables (clear or stub `CLAUDE_CODE_EXECUTABLE`, `CODEX_*` and `GROK_*` in the tests that read them), and find the cause of the stall.

## Acceptance criteria

- [ ] `CLAUDE_CODE_EXECUTABLE=/nonexistent pnpm test` passes.
- [ ] The full suite passes inside a real Stintwork stint (record the run in Comments).
- [ ] All checks pass.
