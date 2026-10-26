# 04 — Keep startup usable and checkpoint failed recovery

Status: ready-for-agent
Blocked by: 03

## What to build

Finish the automatic recovery failure path and its developer-visible state in snapshots/history. Reserve candidates during local discovery, then run recovery in the background so `initialize()` no longer makes board/health/history requests await agent handshakes. Limit each candidate to one attempt per server lifetime with a 60-second setup allowance, excluding live human permission waits. Do not retry on API reads or reconnects.

Route the spec's invalid/legacy metadata, torn/ambiguous logs, changed/missing CLI/cache/lock/host, unsafe worktree, load/mode/directory rejection, auth/provider/network errors and timeout/transport failures to the existing checkpoint fallback. Terminate the replacement writer first, retain precise reason and risky-file/checkpoint results, and append one interrupted ending. Record fallback finalization before checkpointing so a crash there does not restart work. Keep missing/foreign trees untouched. Login errors also use existing login attention; no automatic login or new stint.

Apply the explicit Grok policy: no load attempt, native launch unchanged for later new stints, interrupted checkpoint fallback with experimental explanation. A live/uncertain process owner is blocked with guidance, never checkpointed concurrently. A normal post-resume work/after-turn failure retains today's semantics rather than retrying recovery.

## Acceptance criteria

- [ ] Board, health and history respond during slow recovery; a per-stint error leaves other work items usable and reserved conflicting actions blocked.
- [ ] One bounded attempt per candidate survives repeated startup/API/reconnect calls without duplicate launches/endings; no work-turn timeout or retry loop is added.
- [ ] Table-driven local checks cover each failure family, exact reasons and zero startup preparation/download/reselection/new-session calls.
- [ ] Fallback stops the writer before checkpointing, preserves partial work/history/warnings and records a real commit or explicit checkpoint failure, with no fabricated handoff.
- [ ] Legacy/torn/missing/foreign logs retain readable history and warnings; terminal logs remain unchanged, and a crash during fallback cannot resume implementation.
- [ ] Grok skips resume with an experimental explanation; auth errors preserve login guidance, and only developer action starts a new stint from recorded state.
- [ ] Comments record checks and resource limits; repo-backed tracker assertions stay independent of exact statuses/counts.

## Comments

**Codex, 2026-10-26:** Failure injection uses fake ACP, isolated cache and Git fixtures without registry/provider network. Socket readiness/concurrency, real offline/provider failures and Grok observations are coordinator-run; Grok real verification is not an M10 blocker.

**Codex, 2026-10-26 — ticket 04 implementation:** Implemented on `codex/m10-04`, based on `02dafed`. No commit and no `Status:` changes; tickets 05–08 remain unchanged.

Behaviour and handoff seams:

- Startup discovers logs once, reserves every readable unfinished candidate synchronously, then queues both resume and checkpoint fallback. `initialize()`, board, health and history do not await recovery verification, ACP setup or checkpointing. Unreadable logs/directories become project warnings; one failed candidate does not take the API offline. Repeated reads/start calls and WebSocket reconnects cannot launch another attempt. Multiple unfinished logs for a work item, a live owner or an unverifiable old process block its mutations with cleanup guidance.
- A single 60-second recovery setup budget covers warm verification, writable-directory lookup, initialization, load and mode restoration. Only an actual live permission callback pauses the budget while awaiting the developer. It ends when setup succeeds; there is no work-turn deadline or retry loop. Ticket 06 still owns saved-permission reconstruction/rebinding and reconciliation. The launcher's ordinary fresh-start timeout remains intact; cancelled/settled initialization cannot later persist a session or continue work.
- JSONL adds `{ type: "recovery", version: 1, at, kind: "resume", state: "resuming" | "resumed" | "fallback", reason? }`. Core validates/folds this into existing stint summaries, snapshots and history; lifecycle remains `running` during setup. Durable stream sequences include these entries. Ticket 07 owns the translated presentation and copy.
- Invalid/legacy/incomplete metadata, torn/ambiguous control history, changed/missing source/cache/lock/host identities, unsafe worktrees, unsupported load/directories/mode, load/auth/provider/network rejection, setup timeout and transport/process loss use the shared ending/checkpoint path. A replacement's `done` includes process exit and outstanding file-write cleanup before fallback checkpointing. The fallback marker and interrupted finalization are durable before checkpointing, so restarting during fallback cannot reload implementation. Checkpoint errors retain `interrupted`, the real resume reason, explicit checkpoint diagnostics and original files, without inventing a commit or handoff. Saved real outputs, original Review identity and risky-file rules remain in the shared lifecycle.
- Worktree/stage/branch/base ancestry is checked again before writes. Missing, foreign, changed-branch or superseded worktrees are untouched. Appends use the discovered log file rather than trusting a logged ID as a path. Logs without a usable start remain warnings; completed logs remain byte-for-byte terminal. Grok takes experimental checkpoint fallback without load or source changes. Authentication failure retains the existing login-required attention and login command; no automatic login or new stint is introduced. Ordinary work/after-turn failures after successful setup retain normal ending semantics.
- Ticket 05 still owns suspension, Stop races and verified old adapter/tool-descendant cleanup. This ticket conservatively blocks live/uncertain old writers and does not signal a logged PID.

Changed files:

- `packages/server/src/index.ts`, `stints.ts`, `stint-history.ts`: discovery/reservation, background recovery, budget, safe fallback and warning handling.
- `packages/core/src/stints.ts`, `stints.test.ts`: recovery state validation/folding/summaries, terminal immutability and missing-start warnings.
- `packages/agents/src/index.ts`, `packages/agents/test/adapter-cache-fixture.ts`: resume-budget ownership/cancellation guards and isolated fake ACP failure injection.
- `packages/server/src/stint-history.test.ts`: failure tables, writer-exit-before-checkpoint hook, risky/partial files, fallback/checkpoint failure, no retry/download/new session, metadata/path safety, slow readiness/mutation/reconnect, live-wait budget and post-setup failure checks. Existing fallback tests now await their background ending explicitly.
- This ticket's Comments only.

Validation commands:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run packages/core packages/agents \
  packages/server/src/{stints,stint-history,review-findings,stop-and-failure,checkpoint-handoff,stint-permissions}.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:HTTP start|rich events and pending permission|HTTP preparation disconnect|TCP: true|WebSocket|Needs-you snapshots reach both tabs))'
```

Coordinator: run the same Vitest command **without `--testNamePattern`** on a socket-enabled machine. The 13 socket-dependent runnable cases are:

1. `stint-history.test.ts`: the existing legacy `SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: true)`.
2. `stint-history.test.ts`: four `SIGKILL resumes the same stint/session through loadSession (TCP: true)` cases, Claude/Codex × Installed/Bundled. Their stream assertions now distinguish the startup marker already included in snapshot/history from subsequent live frames.
3. `stint-history.test.ts`: new `slow startup leaves board/health/history usable, reserves mutations and reconnects once (TCP: true)`, including repeated WebSocket connections while warm verification is held, blocked conflicting actions and usable checks on another work item.
4. `stints.test.ts`: `HTTP start streams ACP messages over WebSocket in durable log order and ends finished`.
5. `stints.test.ts`: `rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP`.
6. `stints.test.ts`: `HTTP preparation disconnect cancels before download and a new request retries`.
7. `stint-permissions.test.ts`: `Needs-you snapshots reach both tabs; a queue answer is logged, received by the agent and removed everywhere`.
8. `stint-permissions.test.ts`: `real HTTP answers sent immediately on WebSocket request events reach the agent twenty times`.
9. `checkpoint-handoff.test.ts`: `HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence`.
10. `stop-and-failure.test.ts`: `Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (WebSocket)`.

The four-agent/source row above counts as four cases, giving 13 total. This sandbox cannot bind sockets or reach provider/registry network; these cases were excluded, not passed. Real offline/provider/auth failures, Grok observations and browser presentation remain coordinator resources. Ticket 08 owns the complete real-agent runbook; tickets 05/06 own shutdown/Stop and restored permissions. No real-agent, browser, server-only descendant cleanup, other-platform or M10 exit pass is claimed. Child servers use `sourceNodeArgs` / `--conditions=development`; generated fake adapters use Node built-ins, so CI does not require workspace `dist`. Ignored package `node_modules` links were redirected locally to this worktree's workspace packages while reusing installed external dependencies; no main-checkout edits or downloads.

Checks actually run:

- `format:check`: passed, 382 files.
- `lint`: passed, 334 licence headers / 383 Biome files; only the pre-existing informational `biome.json:24` deprecation.
- The broad core/agents/six-server command above: passed, 60 files / 1,337 tests, with the 13 listed socket cases excluded.
- After the final discovery read/list-error isolation, `pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts --configLoader native --testNamePattern='^(?![\s\S]*TCP: true)'`: passed, 51 tests / 6 socket cases excluded. This includes all failure tables, both source/agent crash paths, path safety and the new discovery I/O-error check.
- The final typecheck caught a mutable annotation on `RepoFiles.list`'s readonly result; it was corrected to `readonly string[]` with no runtime change. Final typecheck result is recorded below.
- Final `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace after the readonly annotation correction.
- Final `format:check`, `lint` and `git diff --check`: passed. A separate Markdown/diff guard verified the complete pre-Comments ticket content (including acceptance boxes), every `Status:` line and tickets 05–08 are unchanged. No commit.

**Codex, 2026-10-26 — coordinator regression follow-up:** Reproduced all four reported failures on `e7cb162` in the coordinator checkout. The old synchronous-startup expectations conflict with ticket 04's background recovery. No production-code change is needed: `prepareStintBrief` already refuses a running stint before compiling, and fallback checkpoints before appending its terminal entry.

- `brief-preview.test.ts`, former “recovery failures return typed metadata…”: the global 503 is obsolete for a per-stint storage failure. The updated test polls the public project snapshot for the unchanged operational diagnostic, checks the typed 409 preview refusal while the work item stays reserved, and verifies health/history remain readable. Storage corruption cannot settle to an ending until repaired; this test waits for its warning rather than an impossible terminal entry.
- `local-data.test.ts`, “interrupted stint recovery uses the same checkpoint guard…”: secret exclusions and durable warnings remain requirements. Reuse the existing `ended` helper, which polls `GET /api/stints/:id`, before reading the snapshot. Keep all original assertions and add another server restart to verify the checkpoint/warnings remain durable.
- `local-data.test.ts`, “interrupted recovery reports the agent's earlier commits…”: committed-risk metadata, excluded build output and checkpoint attention remain requirements. Await the same public history seam; retain every metadata/attention assertion.
- `work-item-files.test.ts`, former “startup recovery checkpoints worktree files before indexing…”: indexing may expose current worktree files during recovery, but compiling the next brief must wait for the checkpoint. Poll the public preview endpoint, accepting only typed active-stint refusals until the first 200. Outside the poll, assert that this first successful brief contains the real recovered checkpoint and no changed paths. Keep the Git-content assertion and subsequent edit/changed-path comparison. API requests initialize recovery directly; this test needs neither a listener nor a file watcher.

The focused four-case command passed with no watcher override. All three touched files also passed with `CHOKIDAR_USEPOLLING=1` and only their three socket cases excluded: 43 passed / 3 skipped. Polling avoids this sandbox's native-watcher `EMFILE`; the unmodified whole-server command is run separately and its actual result is recorded below. No new child processes or source-loading conventions were introduced. No commit; all `Status:` lines and tickets 05–08 stay unchanged.

Follow-up validation:

- `pnpm --config.verify-deps-before-run=false format:check`: passed, 382 files.
- `pnpm --config.verify-deps-before-run=false lint`: passed, 334 licence headers / 383 Biome files; the existing `biome.json` deprecation remains informational.
- `pnpm --config.verify-deps-before-run=false typecheck`: passed across the workspace.
- `git diff --check`: passed. A separate guard verified every changed file's `Status:` lines, ticket 04's entire pre-Comments content and untouched tickets 05–08.
- `pnpm --config.verify-deps-before-run=false vitest run --project server --configLoader native`: completed all 36 files / 545 cases, **508 passed / 37 failed**, exit 1, 480.75 seconds. All four reported regressions passed. Log: `/tmp/m10-04-server-full.log`.
- Of the remaining failures, 28 directly report `listen EPERM`; four TCP child-server cases report `Server exited: 1` at their listener startup (their non-TCP counterparts pass). Five native-watcher cases report `EMFILE`; none is a recovery regression. All five passed in the polling run below.

```sh
# Focused regressions, without watcher overrides: 4 passed / 42 unrelated cases skipped.
pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/{brief-preview,local-data,work-item-files}.test.ts \
  --configLoader native \
  --testNamePattern='recovery storage failures|interrupted stint recovery uses|interrupted recovery reports|startup recovery keeps'

# Complete touched files, excluding only three sockets: 43 passed / 3 skipped.
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/{brief-preview,local-data,work-item-files}.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:worktree ticket edits push|main spec edits push))'
```

Whole-server socket-dependent failures (32 runnable cases; all paths under `packages/server/src/`):

- `agent-registry.test.ts`: `the WebSocket snapshot attributes a completed stint and handoff to the registered second agent`.
- `checkpoint-handoff.test.ts`: `HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence`.
- `checks.test.ts`: `output is streamed over the existing WebSocket before the check completes`.
- `claude-code.test.ts`: `WebSocket snapshots publish login attention and its removal after availability refresh`.
- `create-work-item.test.ts`: `creation broadcasts a first-stage card over the live connection without a reload`.
- `grok.test.ts`: `a Grok login attention item arrives and clears in live HTTP/WebSocket snapshots`.
- `index.test.ts` (nine): `server serves the page and project health over HTTP`; `GET /api/project returns indexed work items`; `editing a ticket Status line pushes a new snapshot over WebSocket within 1 second`; `adding a new .scratch directory adds a work item`; `watching discovers project directories that do not exist at startup`; `roadmap, workflow and setup changes are included in live snapshots`; `atomic ticket replacement and file or work-item deletion update the snapshot`; `files outside the project paths are not indexed or watched`; `stop closes active clients, watchers and HTTP and is safe to repeat`.
- `stint-history.test.ts` (six): legacy `SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: true)`; four Claude/Codex × Installed/Bundled `SIGKILL resumes the same stint/session through loadSession (TCP: true)` cases; `slow startup leaves board/health/history usable, reserves mutations and reconnects once (TCP: true)`.
- `stint-permissions.test.ts` (two): `Needs-you snapshots reach both tabs; a queue answer is logged, received by the agent and removed everywhere`; `real HTTP answers sent immediately on WebSocket request events reach the agent twenty times`.
- `stints.test.ts` (three): `HTTP start streams ACP messages over WebSocket in durable log order and ends finished`; `rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP`; `HTTP preparation disconnect cancels before download and a new request retries`.
- `stop-and-failure.test.ts`: `Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (WebSocket)`.
- `superseded-handoffs.test.ts` (two): `resuming 1 removes the source handoff, keeps new questions, and survives restart (WebSocket: true)` and its `resuming null` case.
- `work-item-files.test.ts` (three): `worktree ticket edits push a snapshot within 1 second (exists at startup: true)` and its `false` case; `main spec edits push a divergence warning naming the worktree, and restoring them clears it`.

Native-watcher failures (five, `work-item-files.test.ts`): `the watcher reindexes worktree files and main-only work items without an HTTP listener`; `the watcher discovers a newly registered worktree and falls back to main when it is removed`; both `main file watching discovers new work without an HTTP listener (scratch exists: true/false)` cases; `main file watching includes roadmap, workflow and setup edits without an HTTP listener`.

Coordinator: rerun the unfiltered whole-server command above on the socket-enabled host with native file watching. No build or package change is introduced by this follow-up; the coordinator's prior build/smoke/browser evidence is not rerun or newly claimed here.
