# 06 — Restore a waiting permission to Needs you

Status: ready-for-agent
Blocked by: 05

## What to build

Carry an unanswered manual permission through restart from durable log to Needs you and a working new-process response. Extend current permission folding/attention and server/launcher receipt handling, preserving original age, full tool details and actual options. Show the restored item as reconnecting until it has a current live callback; never serialize or recreate a callback from data alone.

Rebind a matching reissued tool request to a fresh attempt/request ID and receipt, showing one logical item. Changed details/options require fresh consent. Reject stale-attempt POSTs with 409, including reused IDs, and preserve invalid-option, duplicate-submit and origin checks. A previously manual request must not be auto-approved by recovered edit-freely policy. Keep answering pending through current transport write and persist delivery outcome; a pre-crash selected decision is not proof of delivery or execution.

Handle requests arriving during load without deadlocking startup or charging human wait against setup timeout. If no live callback returns, follow the spec's bounded reconciliation/turn-resolution policy and retire stale attention rather than enabling a dead request forever. Explicit Stop, fallback and terminal replay clear/disable controls. Include minimal en/zh-CN reconnecting/binding copy with the end-to-end behaviour; ticket 07 completes shared recovery presentation.

## Acceptance criteria

- [ ] Restart restores the pending manual item with original age/details/options; controls remain disabled until a matching new live callback can receive a response.
- [ ] Matching reissue yields one logical item with a fresh binding; changed request content/options needs fresh consent, without automatic approval.
- [ ] A current answer is delivered once to the live transport and its delivery outcome is recorded; ambiguous pre-crash delivery asks again instead of replaying consent.
- [ ] Old-attempt/reused IDs and duplicate/invalid/cross-origin submissions are rejected safely; replayed or ended requests are never actionable.
- [ ] Live permission arrival during load does not deadlock; human wait is unbounded, while missing callbacks are reconciled/retired or fail recovery within the specified setup allowance.
- [ ] Stop/fallback clears all bindings and queue items, without recording shutdown itself as a developer rejection.
- [ ] Runnable fake-process and UI behaviour checks cover allow/reject, receipt-write failure and crash ambiguity; Comments separate local results from coordinator real-agent/network/socket/browser checks.

## Comments

**Codex, 2026-10-26:** Read `docs/agents/frontend.md` before web changes. The coordinator must run a real pending Ask-level request across restart for both Claude Code and Codex, including rejection with no denied side effect. Fake receipt tests alone do not verify ACP reissue behaviour.

**Codex, 2026-10-26 — ticket 06 implementation:** Implemented on `codex/m10-06`, uncommitted. No `Status:` line or acceptance checkbox was changed.

- Replaced ticket 05's pending-permission fallback with restoration through the existing launcher, JSONL fold, Needs you and answer route. Startup invalidates saved bindings before asynchronous writer inspection/verification. A pending manual request retains its original age, complete tool details and actual options, with disabled reconnecting controls until a live callback exists. Matching structural tool JSON and normalized options preserve one logical attention item across fresh request/attempt IDs. Changed details/options create a fresh consent request; unmatched saved attention retires when the resumed turn resolves.
- Added attempt-scoped delivery records (`permission_delivery`, `written` / `failed` / `retired`). Selection alone keeps an item answering; HTTP success waits for the current transport write and its durable delivery record. Delivery/log-write failure returns an error and disables the failed request. A selected record without written proof, including an older pre-receipt-format record, is uncertain on recovery and never replays consent. Written proof does not claim the tool executed or promise exactly-once external effects.
- Previously manual requests cannot be auto-approved by edit-freely while reconciling the recovered turn. Live callbacks during load can be answered before readiness, including when load returns while a callback is still waiting; continuation cannot overtake the live response. Real human waits pause the setup budget. Missing callbacks retain the remaining 60-second setup allowance until rebound or retirement at the first resumed work/handoff/findings result; otherwise recovery takes the existing interrupted/checkpoint fallback. Ordinary established work has no new deadline.
- Answer POSTs include the current `attemptId`; old/missing attempts, reused IDs, duplicate submissions, invalid options and foreign origins cannot consume a current binding. Durable Stop immediately disables preceding bindings, while existing genuine Stop/handoff permission behavior remains supported. Suspension detaches without a developer rejection; Stop, fallback, receipt failure and terminal/replayed history cannot expose stale actions.
- Added the reconnecting/waiting copy together in `en` and `zh-CN`, shared by Needs you and the stream. Component state resets with the binding identity, so a reused ID cannot inherit a previous submission. The existing browser matrix now checks disabled reconnecting controls, a live snapshot rebind, one queue row, keyboard answers carrying the new attempt and pending/error states, with layout assertions and screenshots.

Regression tests use isolated fake agents/processes, ACP streams and Git projects, explicit readiness/answer/write/turn signals, and virtual clocks for setup/human-wait and after-turn deadlines. Named server observation steps include project warnings and the last 12 durable log entries on failure; real Git completion polls only observe I/O. Existing native server-only crash diagnostics and cleanup rules remain intact. Test-first failures demonstrated edit-freely approval of a restored manual edit, missing restoration, reused-ID binding refusal, legacy delivery ambiguity, missing after-turn retirement, Stop retaining old controls and misleading failed-delivery presentation before their fixes.

Actual local checks (all final commands/groups passed):

- `pnpm --config.verify-deps-before-run=false format:check`, `lint`, workspace `typecheck`, and `git diff --check`. Lint has only the existing informational Biome configuration deprecation. Append-only/Status/branch/ADR preservation was checked separately.
- `packages/core packages/agents packages/git packages/cli packages/web`: **121 files / 2,038 passed / 10 excluded**, using `--configLoader native` and the native/socket exclusions below. Log: `/tmp/m10-06-nonserver-validated.log`.
- The seven affected server files `stints`, `stint-history`, `stint-permissions`, `stop-and-failure`, `checkpoint-handoff`, `claude-code`, `permission-levels`: **7 files / 156 passed / 60 excluded**, with `CHOKIDAR_USEPOLLING=1`, `--configLoader native` and the exclusions below. Log: `/tmp/m10-06-server-validated.log`.
- All other server files: **28 files passed / 1 file wholly excluded; 377 passed / 20 excluded**, with the same polling/config settings. Log: `/tmp/m10-06-remaining-server.log`. The two socketless `superseded-handoffs.test.ts` cases were inadvertently covered by the broad `WebSocket` name exclusion; running that file with `--testNamePattern='WebSocket: false'` passed **2/2**. Log: `/tmp/m10-06-socketless-replay.log`.
- Final focused restoration/stream checks: **4 files / 31 passed** (`packages/agents/src/permission-restoration.test.ts`, `packages/core/src/permission-restoration.test.ts`, `packages/web/src/PermissionRestoration.test.tsx`, `packages/web/src/StintStream.test.tsx`). This includes the additional outstanding-load-callback case added after the broad run. Log: `/tmp/m10-06-final-regressions.log`.
- `NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false exec playwright test drawer-and-needs-you.spec.ts --list`: **28 cases listed**, not browser-executed. Without built packages/development conditions the initial listing could not resolve core's `dist` export; no browser pass is claimed. Log: `/tmp/m10-06-browser-list.log`.

Early broad runs exposed native-inspection denials plus old test clients/assertions that omitted attempt IDs or expected no delivery record. Updated all permission POST callers in tests and preserved their business assertions, then reran the passing groups above. Failed/red invocations are not counted as passes. Ignored package dependency links were redirected to this worktree's workspace sources while reusing installed external dependencies; no downloads or main-checkout changes.

After the separate socketless rerun, **88 native/socket cases remain deferred, not passed**:

- `packages/agents/src/adapter-cache.test.ts`: nine prepared-adapter/native-inspection cases (Installed preparation/handshake/cache-only launch × both agents; explicit executable handshake × both agents; offline Installed/Bundled warm reuse × both agents; Bundled cold/warm launch × both agents; real fake-ACP handshake failure).
- `packages/server/src/stint-history.test.ts`: 44 cases — all 24 native server-only SIGKILL cases; all 13 failed-recovery variants; saved handoff/findings recovery; both slow-startup transport cases; legacy TCP SIGKILL fallback; failed-resume checkpoint errors; graceful suspension/continuation. The 24 native cases are automatically skipped by this sandbox's independent native-access probe.
- `packages/server/src/stints.test.ts`: eight prepared source/agent/session-write cases and its three HTTP/WebSocket cases. Also the two real HTTP/WebSocket cases in `stint-permissions.test.ts`, and the WebSocket case in each of `checkpoint-handoff.test.ts`, `stop-and-failure.test.ts`, `claude-code.test.ts`.
- Remaining server sockets: all nine `index.test.ts` cases; both `superseded-handoffs.test.ts` `WebSocket: true` cases; both `work-item-files.test.ts` worktree-ticket push cases and its main-spec divergence push case; the WebSocket cases in `checks.test.ts`, `grok.test.ts`, `create-work-item.test.ts`, `agent-registry.test.ts`.
- `packages/cli/src/cli.test.ts`: busy-port fallback.

Coordinator — exact automated checks on the native socket-enabled POSIX host, without name exclusions:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run --configLoader native
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false smoke:package
pnpm --config.verify-deps-before-run=false test:e2e
```

Require all **24 server-only SIGKILL** and **13 failed-recovery** cases to execute, not skip. For a focused lifecycle rerun, run `pnpm --config.verify-deps-before-run=false vitest run packages/agents packages/server/src/{stints,stint-history,stint-permissions,stop-and-failure,checkpoint-handoff,claude-code,permission-levels}.test.ts --configLoader native` without a filter. Verify real HTTP/WebSocket replay/reconnect in two tabs: disabled saved controls, a single matching live item with its original age/details/options, current allow/reject delivery, 409 for the old attempt/reused ID and duplicates, 400 for invalid options, and 403 for foreign origin. Force a receipt/write failure and missing-callback timeout; verify queue retirement and checkpoint fallback after writer cleanup.

Coordinator browser review: run all e2e tests against the rebuilt assets, including the 28 `drawer-and-needs-you.spec.ts` cases. Review reconnecting/rebound/pending/error, Stop and fallback in `en` and `zh-CN` at 1440/1024/768/390px and the 360px minimum; both light/dark at 1440/390px. Save screenshots, confirm keyboard/focus behavior, viewport gutters and intentional code scrolling, and record the required human review at 1440/390px in both languages. Listing tests here did not perform this review.

Coordinator real-agent/network acceptance: in disposable Git projects using the maintainer's existing logins, run **Claude Code and Codex × Installed and Bundled × graceful restart and server-only SIGKILL × Allow and Reject** at **Ask** level (16 combinations). Prepare each source explicitly before testing; recovery must download nothing and retain the exact recorded executable/adapter, stint/session/brief/worktree identities. Hold a real permission before restarting; the new live callback must restore an answerable request. For every Reject case, independently prove the denied file/command side effect never occurred, then inspect the resulting handoff/checkpoint. Include Stop while reconnecting/waiting, a forced failed load, changed request/options requiring fresh consent, and a selected-but-unwritten crash boundary that asks again. Verify old adapter/tool writers are gone or recovery safely blocks; never assume real adapters survive server death, since stdin EOF commonly exits them. Keep unrelated host processes alive. Each host wait should name its step; failures should include server stderr, ACP trace, `/api/project` warnings and the final 12 log entries. Do not count an unbound/retired request or checkpoint fallback as a successful real permission restoration. Record revision, host/Node, source/executable/adapter/lock, PIDs, stint/session IDs, crash point and observed allow/reject effects without credentials.

No socket, native-process, browser, real authenticated agent, provider-network, package-smoke or M10 exit success is claimed locally. Tickets 07–09 and coordinator acceptance remain separate; no commit was made.
