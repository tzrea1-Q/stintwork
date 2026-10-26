# 02 — Record a live stint's recovery state

Status: ready-for-agent
Blocked by: 01

## What to build

Make a newly started Claude Code or Codex stint leave enough validated state to recover, end to end from the registered launcher to its JSONL log and history API. Reuse the existing `started` fields and M9's selected `PreparedAgent`; add only the spec's versioned recovery data. Expose the ACP ID immediately after `newSession` and synchronously persist it before a work prompt can run. Source details currently emitted as text are not recovery metadata.

Record canonical executable identity/version, source/reason, adapter/cache/lock/host identity, permission level, process-attempt ownership and lifecycle progress. Persist phase boundaries and completed handoff/findings before moving forward; preserve original reviewed/base commit identity. A Stop intent must be durable before cancellation. Extend validation/folding/summaries with backward compatibility, without resuming anything yet. Pending requests already have durable details; this ticket leaves their live rebinding to 06.

Use existing fake ACP/Git/cache seams for a runnable check proving disk order, API folding and a normal ending. Do not persist credentials, environment variables, callbacks or duplicate transcripts.

## Acceptance criteria

- [ ] One normal start records the actual session and selected Installed/Bundled identities before its first prompt; a failed metadata write prevents work from starting.
- [ ] Validated recovery entries reach log folding/history while legacy started/ended logs still parse without invented session metadata.
- [ ] Work, handoff, findings and finalization boundaries retain completed results and the original brief/base/reviewed commit.
- [ ] Durable Stop intent precedes cancellation, and process-attempt ownership can distinguish unrelated or reused PIDs.
- [ ] Existing normal finish/Stop/failure still collects output and checkpoints with the same risky-file/evidence rules and one terminal ending.
- [ ] Isolated regression checks cover ordering, validation, missing metadata and read-back; Comments record checks and resource limits.

## Comments

**Codex, 2026-10-26:** Fake subprocess and local Git checks belong to this ticket. Real authenticated agents/provider network and socket history checks are coordinator-run; no real compatibility or crash success is implied by unit tests.

**Codex, 2026-10-26:** Implemented ticket 02 on `codex/m10-02`, based on `d1b0e29`, without committing or changing any `Status:` line. No resume, shutdown suspension, startup ownership enforcement or permission rebinding was added; those remain 03–06.

New JSONL records share `{ type: "recovery", version: 1, at, kind, ... }`:

- `kind: "launch"`, `launch`: the selected `PreparedAgent`'s agent/source/reason, canonical executable path/version/file identity, adapter entry/version, cache key and released lock digest, plus M9's host identity (`os`, `arch`, `libc`, Node major, ABI) and actual permission level. Only these fields are serialized, never the configured environment.
- `kind: "attempt"`, `attempt`: a UUID, owner server PID/process-start timestamp, adapter PID and unique observable `stintwork-<UUID>` Node process title. Non-prepared launchers have `marker: null`, explicitly insufficient for signalling by PID. Cleanup/verification belongs to 05; this does not claim that old writers are already stopped after a server crash.
- `kind: "session"`, `attemptId`, `sessionId`: written synchronously immediately after `newSession`, before mode setup or any work prompt. A write failure aborts launch work and closes the adapter.
- `kind: "phase"`, `attemptId`, `progress`: `phase` is `work`, `handoff`, `findings` or `finalization`; deltas retain the work stop reason, completed parsed handoff/error, original-commit findings/error/raw reply, and finalization status/error. Completed results are saved before the next request; folding merges deltas without repeating transcripts or recompiling the brief. Existing `started` retains the original brief/worktree/branch/base commit, and findings retain the original reviewed commit.
- `kind: "stop_requested"`: persisted before cancellation or clearing live permissions; a failed write prevents cancellation. Earlier log bytes and torn last lines are preserved by the shared newline-safe append helper.

Recovery data validates and folds into stint history and summaries. Legacy logs retain absent metadata, parse warnings survive, and terminal logs cannot be reopened. Existing ordinary finish/Stop/failure handoff, checkpoint, risky-file and Review evidence behavior remains covered.

Checks:

- `pnpm --config.verify-deps-before-run=false format:check`: passed, 381 files.
- `pnpm --config.verify-deps-before-run=false lint`: passed, 333 licence headers and 382 Biome files; existing informational `biome.json:24` deprecation only.
- `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace.
- `pnpm --config.verify-deps-before-run=false vitest run packages/core packages/agents --configLoader native`: passed, 54 files / 1,205 tests. Includes missing/invalid metadata, legacy/terminal folding, session-before-mode persistence, phase/result ordering and persistence-failure prompt prevention.
- Focused server command below: passed, 6 files / 80 tests; the 8 socket-dependent cases listed below were excluded. Includes registered Claude/Codex × Installed/Bundled, actual filesystem session-write failure, API read-back, process-title ownership, durable Stop/write failure, original Review identity, normal checkpoint/handoff, permissions, torn logs and a socketless killed-server fallback. An earlier socket attempt produced the expected `listen EPERM`; it is not a pass.
- `git diff --check`: passed. The inherited package `node_modules` links pointed at the main checkout; local ignored links were redirected to this worktree's workspace packages while reusing installed external dependencies, without downloads or edits to the main checkout.

```sh
pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/stints.test.ts \
  packages/server/src/stint-history.test.ts \
  packages/server/src/review-findings.test.ts \
  packages/server/src/stop-and-failure.test.ts \
  packages/server/src/checkpoint-handoff.test.ts \
  packages/server/src/stint-permissions.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:HTTP start|rich events and pending permission|HTTP preparation disconnect|TCP: true|WebSocket|Needs-you snapshots reach both tabs))'
```

Coordinator: run that same command **without `--testNamePattern`** on a socket-enabled machine. These eight cases remain runnable in the existing suites:

1. `stints.test.ts`: “HTTP start streams ACP messages over WebSocket in durable log order and ends finished” (now also asserts session/work recovery frames and contiguous durable sequences).
2. `stints.test.ts`: “rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP”.
3. `stints.test.ts`: “HTTP preparation disconnect cancels before download and a new request retries”.
4. `stint-history.test.ts`: “SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: true)”. This remains the existing fallback test, not an automatic-resume claim.
5. `stint-permissions.test.ts`: “Needs-you snapshots reach both tabs; a queue answer is logged, received by the agent and removed everywhere”.
6. `stint-permissions.test.ts`: “real HTTP answers sent immediately on WebSocket request events reach the agent twenty times”.
7. `checkpoint-handoff.test.ts`: “HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence”.
8. `stop-and-failure.test.ts`: “Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (WebSocket)”.

This sandbox cannot bind sockets or reach the network. No real authenticated agent/provider, registry, browser, automatic recovery, server-only orphan cleanup or M10 exit pass is claimed. The local source-loading subprocess tests use `sourceNodeArgs` or `--conditions=development`, so they do not require workspace `dist` output in CI.
