# 05 — Suspend on shutdown and honor Stop across crashes

Status: ready-for-agent
Blocked by: 04

## What to build

Make graceful server shutdown preserve an eligible active stint for the same startup path as a crash. Record suspension/phase, detach callbacks and stop the owned agent/tool processes with bounded cleanup; do not ask for a handoff, append a rejection/ended event or checkpoint merely because the server closes. Preserve a genuine completed turn's saved finalization rather than resuming implementation.

Keep explicit Stop terminal, including during load or a pending permission. Persist intent before cancellation, prevent a late ready/continuation callback from running, then clean up and use the normal checkpoint/ending path. Recovery of that Stop intent finalizes the stop instead of sending work. Make repeated Stop/shutdown safe.

Complete the ownership check for old processes on crash/restart. Kill only the server in the main fake-process crash check; prove old adapter/tool writers are gone before replacement/checkpoint. Use recorded attempt ownership plus process identity, never a bare PID. A concurrent live owner or unverifiable orphan blocks mutations with guidance; never signal unrelated processes. Keep the solution within the existing server/launcher lifecycle, without a supervisor.

## Acceptance criteria

- [ ] Graceful shutdown leaves resumable state and no terminal ending/checkpoint/developer rejection for an active suspended stint; the next startup reaches handoff under its original IDs.
- [ ] Stop before/during load or continuation durably prevents more work, clears live requests and ends with bounded cleanup, checkpoint and one stopped ending.
- [ ] Crashing after Stop intent or after-turn completion resumes only the recorded finalization, never implementation.
- [ ] Server-only death proves old owned agent/tool writers stop before replacement; unverifiable ownership blocks recovery/checkpoint without harming unrelated processes.
- [ ] Concurrent server ownership, reused PID, repeated Stop/shutdown and late callbacks have isolated regression coverage and leave at most one writer/terminal ending.
- [ ] Comments record actual local checks and the remaining coordinator-run graceful/crash/process/socket cases.

## Comments

**Codex, 2026-10-26:** Local fake-process ownership/phase checks are allowed. The coordinator runs real server-signal/process-tree tests, sockets and real authenticated agent shutdowns; killing an entire process group is not sufficient server-only crash evidence.

**Codex, 2026-10-26 — ticket 05 implementation:** Implemented in `codex/m10-05`, without committing or changing any `Status:` line or acceptance checkbox.

- Graceful shutdown now suspends an eligible active stint through a separate launcher operation. It records suspension, disables live permission/event callbacks before detaching them, stops the owned writers and records completed suspension only after cleanup. It does not request a handoff, record a developer rejection, checkpoint or append `ended` for suspended work. Startup retains the original stint/session/brief/base identities. Saved handoff/findings/finalization remain authoritative, including shutdown before a ready callback is delivered. Legacy launchers retain interrupted/checkpoint behavior; shutdown cancels a launcher still opening its first session before awaiting preparation.
- Explicit Stop persists one intent before cancellation, including the reservation/verification window. It aborts setup, clears live requests, ignores late session/work/ready callbacks and produces one stopped ending/checkpoint. A Stop recovered after a crash never verifies or loads implementation. Repeated Stop/shutdown and Stop concurrent with shutdown are covered.
- Prepared adapters have their own POSIX process group and record native owner/adapter identity alongside the unique attempt title. Cleanup checks the recorded attempt, native start/UID identity, group and live owner before signalling. It freezes the verified group, follows and freezes tool descendants even in separate groups while their ancestry remains verifiable, rechecks child and parent identities before signalling, then waits for writers to disappear within a bounded cleanup budget. A reused PID, changed marker, live owner, missing proof, unverifiable orphan or failed cleanup blocks replacement/checkpoint and mutations with identifying cleanup guidance. A completed suspension is durable cleanup proof; old PIDs are never signalled again merely because they remain in its history.
- A per-work-item ownership file under `.stintwork/local/stint-owners/` reserves recovery before asynchronous verification and also protects fresh starts across servers. A short exclusive claim directory serializes stale-lock reclamation; PID/identity data are validated and release checks a unique token. An interrupted/unverifiable claim stays blocked with its paths in the diagnostic, rather than guessing ownership. This remains inside the existing server/launcher lifecycle.

Regression checks use controlled fake launchers, fake process tables, explicit ACP/IPC signals and virtual clocks for deadlines. Red checks exposed the old shutdown ending/checkpoint, missing suspension, late callback appends, lost saved Review findings, cross-server reservation race, detached tool groups, reused detached-parent ancestry, malformed ownership identity and the first-session shutdown deadlock before their fixes. No new test relies on racing a real timeout. Real Git/file completion polls observe results; they do not drive the shutdown/setup deadlines.

The main fake-process crash matrix now kills **only the server**. Its adapter and separate-group tool report readiness explicitly before the kill. The restart must establish both old writers are gone before the held verifier is released, then load the same session and checkpoint the tool/work/handoff artifacts. Native access is probed independently of the identity parser, so a parser regression fails these cases instead of silently skipping them.

Actual local checks:

- `pnpm --config.verify-deps-before-run=false format:check`: passed.
- `pnpm --config.verify-deps-before-run=false lint`: passed; only the existing informational Biome configuration deprecation remains.
- `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace.
- Core/agents plus the eight related server files below: **63 files, 1,348 passed / 10 socket cases excluded**. Log: `/tmp/m10-05-core-agents-server-final.log`.
- Final complete recovery file: **1 file, 59 passed / 10 excluded** (eight native-process cases plus two TCP cases). Log: `/tmp/m10-05-history-final-validated.log`.
- CLI/Git/web: **62 files, 665 passed / 1 TCP case excluded**. Log: `/tmp/m10-05-other.log`.
- All remaining server files, excluding the nine already covered: **26 files, 335 passed / 16 TCP cases excluded**, with `CHOKIDAR_USEPOLLING=1` for this sandbox's watcher limit. Log: `/tmp/m10-05-remaining-server.log`.
- Together these cover **152 files / 2,407 available tests**; **37 cases were excluded, not passed**. Focused process-ownership checks also passed all 11 cases. `git diff --check` and the ticket/Status preservation guard passed.

The broad run initially found nine compatibility failures (legacy shutdown classification, preparation creating the log directory too early, and a storage diagnostic prefix); all were fixed and all nine passed their focused rerun. A subsequent combined invocation exposed a stale identifier in the native-test access probe; it was fixed, and the final passing file groups above supersede that invocation. No failing or interrupted run is counted as a pass. Local ignored dependency links were redirected to this worktree's workspace packages, reusing installed external dependencies without downloads or main-checkout changes.

Reproducible principal commands:

```sh
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run \
  packages/core packages/agents \
  packages/server/src/{stints,review-findings,stop-and-failure,checkpoint-handoff,stint-permissions,brief-preview,local-data,work-item-files}.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:HTTP start|rich events and pending permission|HTTP preparation disconnect|WebSocket|Needs-you snapshots reach both tabs|real HTTP answers|worktree ticket edits push|main spec edits push))'

pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/stint-history.test.ts --configLoader native \
  --testNamePattern='^(?![\s\S]*TCP: true)'

pnpm --config.verify-deps-before-run=false vitest run packages/cli packages/git packages/web \
  --configLoader native --testNamePattern='^(?![\s\S]*cli falls back to the next free port)'
```

Coordinator: run the unfiltered workspace unit suite on a socket-enabled POSIX host with native process inspection and native file watching:

```sh
pnpm --config.verify-deps-before-run=false vitest run --configLoader native
```

These are the exact 37 excluded cases, grouped by file (server paths are under `packages/server/src/`):

- `stint-history.test.ts`: eight `server-only SIGKILL stops owned adapter/tools before resuming the same session` cases: Claude/Codex × Installed/Bundled × TCP false/true. **Require all eight to run, not skip.** Also the legacy `SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: true)` and `slow startup leaves board/health/history usable, reserves mutations and reconnects once (TCP: true)` cases.
- `stints.test.ts`: `HTTP start streams ACP messages over WebSocket in durable log order and ends finished`; `rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP`; `HTTP preparation disconnect cancels before download and a new request retries`.
- `stint-permissions.test.ts`: `Needs-you snapshots reach both tabs; a queue answer is logged, received by the agent and removed everywhere`; `real HTTP answers sent immediately on WebSocket request events reach the agent twenty times`.
- `checkpoint-handoff.test.ts`: `HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence`.
- `stop-and-failure.test.ts`: `Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (WebSocket)`.
- `work-item-files.test.ts`: both `worktree ticket edits push a snapshot within 1 second (exists at startup: true/false)` cases, plus `main spec edits push a divergence warning naming the worktree, and restoring them clears it`.
- `agent-registry.test.ts`: `the WebSocket snapshot attributes a completed stint and handoff to the registered second agent`.
- `checks.test.ts`: `output is streamed over the existing WebSocket before the check completes`.
- `claude-code.test.ts`: `WebSocket snapshots publish login attention and its removal after availability refresh`.
- `create-work-item.test.ts`: `creation broadcasts a first-stage card over the live connection without a reload`.
- `grok.test.ts`: `a Grok login attention item arrives and clears in live HTTP/WebSocket snapshots`.
- `superseded-handoffs.test.ts`: both `resuming 1/null removes the source handoff, keeps new questions, and survives restart (WebSocket: true)` cases.
- `index.test.ts`: `server serves the page and project health over HTTP`; `GET /api/project returns indexed work items`; `editing a ticket Status line pushes a new snapshot over WebSocket within 1 second`; `adding a new .scratch directory adds a work item`; `watching discovers project directories that do not exist at startup`; `roadmap, workflow and setup changes are included in live snapshots`; `atomic ticket replacement and file or work-item deletion update the snapshot`; `files outside the project paths are not indexed or watched`; `stop closes active clients, watchers and HTTP and is safe to repeat`.
- `packages/cli/src/cli.test.ts`: `cli falls back to the next free port when 4317 is busy`.

Remaining coordinator resources: real CLI/server SIGINT/SIGTERM shutdowns during active work and a permission wait; real server-only SIGKILL with adapter/tool identity inspection; authenticated Claude/Codex continuation; crash immediately after Stop intent and after-turn completion; native cleanup on other supported hosts. Confirm no handoff/checkpoint/rejection on suspension, original IDs on continuation, one stopped ending after Stop and no replacement/checkpoint alongside old writers. No real-agent, socket, native process-tree, browser or M10 exit pass is claimed here; permission rebinding/UI/exit work remains tickets 06–09.

An early exploratory run still used the old whole-server-group crash fixture after adapters became detached, so its old “adapter gone” assertion failed and the run was interrupted. Native `ps` is blocked in this sandbox; no orphan was signalled from an unverified PID. Coordinator should inspect any remaining `stintwork-*` fake adapters from the temporary `stintwork-history-*` / `stintwork-cache-test-*` fixtures and clean them up only after matching attempt/title, start identity and fixture provenance. The revised native matrix tracks attempts for verified failure cleanup.


**Codex, 2026-10-26 — initialization-exit follow-up:** Reproduced the coordinator's stuck-`running` symptom deterministically with fake native inspection: the replacement has native identity metadata, PID/group probes still report it, but `ps` has no live leader. Cleanup's ownership error replaced the original initialization failure and blocked fallback.

The launcher now supplies its own `ChildProcess` exit promise to cleanup. Only this locally observed exit can satisfy the missing-leader case, within the existing cleanup budget; native inspection must also show no remaining group members, direct children or previously observed detached writers. Descendants are remembered from the first verified snapshot so an exiting parent cannot erase their ownership evidence. Foreign/orphan cleanup gets no local exit proof and stays blocked. No PID-only signal or relaxed foreign ownership check was added.

The new server regression failed at `waitForEnding` before the fix and now records one interrupted ending/checkpoint, preserves partial files and the original failure, and launches/prompts no further work. Unit regressions cover both already-observed and later-delivered exit signals, surviving orphan/detached writers, missing exit delivery and unavailable inspection; their deadline uses a fake clock.

Actual checks: `format:check`, `lint`, workspace `typecheck` and `git diff --check` passed (only the existing informational Biome deprecation). All agents tests passed: **23 files / 263 tests**, including all **17 ownership tests**. The complete available recovery file passed **60 tests / 10 native-or-TCP cases excluded**. The original `initialize:exit` case and new fake-native regression also passed together in isolation (**2 passed**). No native-`ps` or socket success is claimed locally. Coordinator: repeat the original failing case on the native host, then run `pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts --configLoader native` without exclusions and the unfiltered workspace suite. No commit; all `Status:` lines and acceptance criteria unchanged.


**Codex, 2026-10-26 — review follow-up (P1/P2):** Verified both findings with failing regressions. Missing adapter/group probes no longer certify cleanup. After possible session work, an exited leader with untraceable descendants blocks checkpoint/suspension/replacement without signalling unrelated processes. Local observed-exit proof is restricted to initialization; the earlier `initialize:exit` fallback still passes with fake native inspection.

Completed suspension covers only preceding attempts, surviving later startup records. Startup also durably records successful cleanup before another attempt starts. Regressions cover uncovered later attempts and three successive recoveries with reused adapter PIDs. Fixtures now distinguish explicit cleanup proof from legacy logs without live-state metadata.

Actual checks: `format:check`, `lint`, workspace `typecheck` and `git diff --check` passed. Final ownership tests: **21 passed**; available recovery tests: **46 passed / 28 deferred**; stint-route tests: **27 passed / 11 deferred**. Broad available run: **151 files passed, 2,388 tests passed / 2 fixture failures / 65 excluded**; both fixture failures were corrected and the available recovery file rerun passed. Initial unfiltered core/agents: **1,228 passed / 9 failures from blocked native inspection**; those prepared-adapter cases remain deferred. One mocked-WebSocket test excluded by the broad filter was separately run and passed.

Coordinator: run these exact commands without exclusions on the native/socket host. They cover prepared-adapter launches, all 13 failed-recovery variants, graceful shutdown/continuation and all socket cases. **All eight server-only SIGKILL cases must execute, not skip.** No native/socket pass is claimed locally.

```sh
pnpm --config.verify-deps-before-run=false vitest run packages/agents/src/process-ownership.test.ts packages/agents/src/adapter-cache.test.ts packages/server/src/stints.test.ts packages/server/src/stint-history.test.ts --configLoader native
pnpm --config.verify-deps-before-run=false vitest run --configLoader native
```

No commit; all `Status:` lines and acceptance checkboxes unchanged.
