# 03 — Resume a crashed stint in a new process

Status: ready-for-agent
Blocked by: 02

## What to build

Deliver the successful crash path for an unfinished Claude Code or Codex stint with no pending permission. Wire `createProjectServer` startup recovery through the existing stint lifecycle/registered launchers rather than ending that eligible stint in `recoverInterruptedStints`. Verify the recorded worktree and warm cache/CLI, reserve the work item and start a new process with the exact recorded source and the launcher's configured environment.

Initialize ACP, require `loadSession`, load the persisted session with its worktree/writable Git directories, restore its original permission mode and send the spec's fixed continuation instruction. Never use `newSession`, compile/replay a brief, repeat setup/dependency installation or call first-use preparation. The successful stint keeps its identity/history and proceeds to a parsed handoff and checkpoint. Respect saved after-turn/finalization phases so a crash there never reruns implementation. Keep old-process ownership safety from the spec; the full shutdown and failure matrix is 04/05.

Run a fake-process killed-server case with a warm selection, capturing the new process, same session, no fresh brief and eventual recorded ending. Maintain the existing fallback for legacy/ineligible logs until 04 expands its failure cases. Do not add a public Resume endpoint or button as an intermediate API.

## Acceptance criteria

- [ ] Startup adopts one eligible stint with the same stint/session IDs, started time, worktree, original brief and base/reviewed commit, using a new owned process.
- [ ] Both registered agents use the recorded source/executable and configured environment; initialization/load/mode/directory handling makes no new session, preparation, download or source switch.
- [ ] The continuation reaches normal handoff/checkpoint; saved handoff/findings/finalization phases request only missing output or finish the ending.
- [ ] Load history replay is not appended as fresh stream/attention, and fresh attempt IDs/sequences cannot merge with old messages or tools.
- [ ] Local reservation prevents concurrent Start and conflicting work-item mutations; a known live owner cannot be adopted or checkpointed.
- [ ] A runnable fake crash check proves the path for both profiles, including no original prompt replay; Comments record actual checks and pending coordinator runs.

## Comments

**Codex, 2026-10-26:** Fake subprocess checks may run locally. The coordinator runs socket-based server kill/restart, WebSocket reconnect, real agents and provider-network checks. This ticket does not promote Grok or certify the M10 exit.
