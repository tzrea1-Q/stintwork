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

**Codex, 2026-10-26 — ticket 03 implementation:** Implemented on `da7d1be`; no commit and no `Status:` changes. Tickets 04–08 and their acceptance checkboxes are unchanged.

Recovery flow:

1. Startup reads the original log, reserves the work item, checks the recorded owner/adapter are absent, and verifies the current work-item/stage association, registered worktree/branch and base-commit ancestry. A live/unverifiable owner or adapter blocks mutations with a project warning; recovery never signals a logged PID.
2. The registered Claude/Codex agent verifies only its recorded warm selection, using its configured environment: released adapter/lock/host/cache identity, private ownership marker, full cached-file integrity, and canonical executable identity/version. A changed executable is rejected before executing it. No preparation, npm, source selection, dependency install, setup commit or brief compilation runs during recovery.
3. The same launcher starts a new owned attempt, requires ACP `loadSession`, loads the saved session with the worktree and writable Git roots, persists that session against the new attempt, restores the recorded permission mode and sends the spec's exact continuation instruction. Loading updates are suppressed; fresh message/plan/tool IDs are scoped to the attempt and durable stream sequences continue after the saved entries.
4. Normal and recovered stints share the existing parsed handoff/findings, checkpoint, risky-file inspection and single-ending path. Saved handoff/findings phases request only missing output; saved finalization finishes without launching an agent. Original stint/session/start/worktree/brief/base and reviewed-commit identities survive. Worktree identity is rechecked after asynchronous verification and before checkpointing.

The startup hook reserves locally and queues the successful path without awaiting its handshake. Ticket 04 still owns the complete setup budget, failure matrix, fallback state/reasons and recovery presentation; 05 owns shutdown suspension, complete Stop races and verified old adapter/tool-process cleanup; 06 owns restored permissions; 07 owns bilingual UI. Legacy/ineligible logs keep the existing checkpoint fallback. No Resume endpoint/button, supervisor, preparation retry or Grok promotion was added.

Changed files:

- `packages/agents/src/index.ts`, `adapter-cache.ts`, `registry.ts`, `codex.ts`, `claude-code.ts`: resume-aware launcher, read-only recorded-selection verification and environment-bound registered hooks. Private recovery hooks are excluded from public agent descriptions.
- `packages/agents/src/adapter-cache.test.ts`, `profiles.test.ts`, and `packages/agents/test/adapter-cache-fixture.ts`: reuse M9's synthetic locked cache/npm fixture; its fake ACP agent now supports `loadSession`, trace/replay and crash/continuation/handoff behavior.
- `packages/server/src/index.ts`, `stints.ts`, `stint-history.ts`, `stint-history.test.ts`: startup adoption/reservation, shared ending lifecycle, safe worktree verification and crash/phase regression cases.
- This ticket's Comments only.

Checks actually run:

- `pnpm --config.verify-deps-before-run=false format:check`: passed, 382 files.
- `pnpm --config.verify-deps-before-run=false lint`: passed, 334 licence headers / 383 Biome files; only the existing informational `biome.json:24` deprecation.
- `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace.
- The broad command below passed 60 files / 1,300 tests, excluding 12 socket-dependent cases. After the final shared-lifecycle/worktree safety changes, rerunning the same six server files passed 92 tests, with those same 12 cases excluded. The added changed-branch-during-verification regression preserves dirty files and HEAD, launches nothing and records an explicit checkpoint failure.
- The final public-agent-description regression was run separately with `pnpm --config.verify-deps-before-run=false vitest run packages/agents/src/profiles.test.ts --configLoader native`: passed, 13 tests.
- `git diff --check`: passed. Existing ignored package `node_modules` links were redirected locally to this worktree's workspace packages while reusing external dependencies; no network/download or main-checkout edits.

```sh
pnpm --config.verify-deps-before-run=false vitest run packages/core packages/agents \
  packages/server/src/{stints,stint-history,review-findings,stop-and-failure,checkpoint-handoff,stint-permissions}.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:HTTP start|rich events and pending permission|HTTP preparation disconnect|TCP: true|WebSocket|Needs-you snapshots reach both tabs))'
```

The four local killed-server success cases cover Claude/Codex × Installed/Bundled. They explicitly kill the isolated old server/adapter process group, observe the old adapter PID disappear, then prove a different process loads the same session, uses the recorded executable and configured environment, suppresses replay, sends only the fixed continuation, preserves earlier bytes, and checkpoints work plus handoff edits. Fresh same-numbered tool/message updates remain distinct. This is **not** server-only orphan/tool cleanup evidence; that remains 05. Child servers load workspace sources through `sourceNodeArgs` / `--conditions=development`; generated fake adapters use only Node built-ins. CI needs no workspace `dist`.

Coordinator socket command: run the broad command above **without `--testNamePattern`**. The 12 excluded runnable cases are:

1. `stint-history.test.ts`: four new `SIGKILL resumes the same stint/session through loadSession (TCP: true)` cases, one per Claude/Codex × Installed/Bundled. They also compare resumed WebSocket frames and contiguous sequences with durable appended entries.
2. `stint-history.test.ts`: existing `SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: true)` legacy fallback case.
3. `stints.test.ts`: `HTTP start streams ACP messages over WebSocket in durable log order and ends finished`.
4. `stints.test.ts`: `rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP`.
5. `stints.test.ts`: `HTTP preparation disconnect cancels before download and a new request retries`.
6. `stint-permissions.test.ts`: `Needs-you snapshots reach both tabs; a queue answer is logged, received by the agent and removed everywhere`.
7. `stint-permissions.test.ts`: `real HTTP answers sent immediately on WebSocket request events reach the agent twenty times`.
8. `checkpoint-handoff.test.ts`: `HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence`.
9. `stop-and-failure.test.ts`: `Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (WebSocket)`.

Real-agent checks to run with the maintainer's existing logins in disposable Git projects:

1. Run **four separate mid-work crash checks**: Claude Code Installed, Claude Code Bundled, Codex Installed, Codex Bundled. Explicitly prepare that source and warm cache before the check. Retain revision/platform/Node, exact executable/version/file identity, adapter/lock/cache/source/reason and configured environment identity without recording secrets or environment values.
2. For each, start a long file-editing stint with no pending permission. Save the original log and record the server/adapter PIDs, stint/session IDs, worktree, original brief, start time and base commit. Kill **only the server PID** with `SIGKILL`, then restart the same project with the same cache and launcher environment. If an old owner/adapter is still live, this ticket must block with guidance and make no replacement/checkpoint writes; ticket 05 must supply safe cleanup before treating that situation as a successful crash check. Never use a group kill as server-only cleanup evidence.
3. Once previous writers are safely gone, verify automatic new-process `loadSession` with the original session/worktree/Git roots/mode, exactly one fixed continuation, no `newSession`, original brief/skill replay, setup/dependency work, registry traffic, source switch or new stint. Verify live/history output agrees, earlier bytes and identity remain, and the stint reaches one parsed handoff and a checkpoint containing pre-crash, continuation and handoff edits.
4. For **each real agent**, additionally crash after its work phase is durably complete, during handoff or Review findings. Restart and verify only missing output is requested; saved results and the original reviewed commit remain. Repeat at saved finalization: checkpoint/ending only, with no implementation prompt or replacement agent launch.
5. After 04–08 land, the coordinator must also run graceful restart, waiting Ask permission allow/reject (no denied side effect), Stop during recovery, two successive restarts, WebSocket reconnect/browser presentation and forced failed-resume checkpoint/new-stint checks. Those are later tickets' real-agent acceptance, not passes claimed here.

This sandbox cannot bind sockets or reach provider/registry network. No socket, real authenticated agent, browser, server-only descendant cleanup, cross-platform or M10 exit pass is claimed.

**Codex, 2026-10-26 — P2 finalization outcome correction:** On committed ticket 03 (`1b9b6eb`), recovery previously defaulted a saved finalization phase without a saved status to `finished`. Normal completion and recovered finalization now share `completionOutcome`: unsuccessful stop reasons produce `failed` plus the authored `stint.stopReason` diagnostic; an absent reason is treated as `unknown`, never as success. Saved outcomes/errors and explicit Stop intent remain authoritative. Recovery still finishes checkpointing without launching an agent.

Changed `packages/server/src/stints.ts`, added two regression cases in `packages/server/src/stint-history.test.ts`, and appended this comment. Both cases (`max_tokens` and absent stop reason) failed before the fix with `finished`, then passed. They verify the persisted diagnostic/code, checkpoint, saved handoff/findings, no agent launch, and `gateReadiness` rejecting the stage as unfinished. No commit or `Status:` changes.

Checks actually run for this correction:

- `pnpm --config.verify-deps-before-run=false format:check`: passed, 382 files.
- `pnpm --config.verify-deps-before-run=false lint`: passed, existing informational Biome configuration deprecation only.
- `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace.
- Focused new regressions with `--configLoader native`: both passed after reproducing the defect before the fix.
- The unfiltered server command below: 61 passed, 9 socket-dependent failures in this sandbox. Those are the five history `TCP: true` cases (legacy fallback plus Claude/Codex × Installed/Bundled crash recovery), the three socket-based `stints.test.ts` cases (HTTP start/WebSocket ordering, rich events/permissions, HTTP preparation disconnect), and Stop/WebSocket. Direct listeners reported `listen EPERM: operation not permitted 127.0.0.1`; the four TCP resume child servers exited before reporting ready. All corresponding socket-free recovery cases and normal completion/Stop/failure checks passed. These failures do not supersede the coordinator's prior socket-enabled suite pass; rerun this command with sockets for the correction:

```sh
pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/{stints,stint-history,stop-and-failure}.test.ts --configLoader native
```

The real-agent acceptance matrix above remains pending with the coordinator; this correction adds no provider-network or real-agent pass claim.
