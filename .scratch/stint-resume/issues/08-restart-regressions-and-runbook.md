# 08 — Verify crash boundaries and prepare real-agent checks

Status: resolved
Blocked by: 07

## What to build

Close gaps in existing lifecycle coverage and leave a repeatable coordinator runbook for ticket 09 in Comments. Reuse `packages/server/src/stint-history.test.ts`, fake ACP/process/cache fixtures and browser harness; do not build another test framework or repeat tests already added by 02–07. Exercise actual server-process replacement, same-session load/continuation, resumed-twice operation, pending permission and failed-resume checkpoint/new-stint flow.

Cover crash boundaries that can restart the wrong phase: before session persistence, after resume reservation/load, during permission answer/write receipt, between work/handoff/findings, after saved outputs and during checkpoint/ended append. Keep legacy/torn/missing/foreign logs, terminal-history immutability, no startup downloads, exact source/environment, old-process cleanup and concurrent-read/owner cases in the affected regression suite. Preserve Review evidence and risky-file assertions rather than weakening them.

Run available full affected checks and package smoke if feasible. The runbook must prepare both Installed/Bundled sources explicitly before recovery and identify real agent/adapter/executable/lock/revision evidence, observable kill points, server-only kill, expected absence of `newSession`/brief/registry traffic, waiting Ask permission, rejection, graceful restart and forced fallback. Do not inspect credentials or change global agent/configuration. Mark missing real/network/socket/browser resources for the coordinator, not as passes.

## Acceptance criteria

- [ ] Existing suites cover the listed crash/phase boundaries, two successive restarts, ownership/concurrency and one ending per stint without redundant new harnesses.
- [ ] Socket-enabled fake-server tests prove process replacement, history/live-stream consistency, current permission delivery and a checkpoint/new-stint fallback while preserving old files.
- [ ] Tests enforce zero recovery preparation/download/reselection and immutable terminal history, with Review/risky-file assertions intact.
- [ ] Comments record format/lint/typecheck, affected core/agents/server/web results and available build/package/browser checks, including exact commands and exclusions.
- [ ] A coordinator runbook specifies both agents and both sources, server-only crash, graceful restart, pending Ask allow/reject, forced fallback and exact evidence to retain.
- [ ] Real-agent/network/socket/browser gaps and platform limits remain explicit; neither old probes nor fake tests are reported as the M10 real exit.

## Comments

**Codex, 2026-10-26:** Unit/fake-process checks use disposable local fixtures. Socket lifecycle, real agents/logins, registry/provider network and browser checks are coordinator-run. Retain successful and failed runs with reasons; do not delete the developer's caches or claim untested platforms.

**Codex, 2026-10-26 — crash-boundary coverage and ticket 09 coordinator runbook:** Uncommitted on `codex/m10-08`, based on `49bccfcfe2e23472fac5ad46c69e18436a10ab23`. All `Status:` lines and acceptance checkboxes remain unchanged. Read ADR 0012, the spec, tickets 02–09 with their Comments, and the read-only host reference `/private/tmp/claude-<uid>/-Users-<user>-Develop-stintwork/0d1280a0-b570-4b1d-a4c5-a8b3a4f0f455/scratchpad/codex-m10-08/perm-restart.reference.sh`; the reference was not executed.

#### Inventory before adding tests

These checks already exist in 02–07 and are reused rather than duplicated:

- `packages/agents/src/after-turn.test.ts`: session/phase persistence before prompts, persistence failure preventing later work, completed handoff before findings, session recording despite mode failure. `packages/server/src/stints.test.ts`: actual session-log write failure, registered agent/source starts, durable Stop before cancellation and terminal append/storage failures. `packages/core/src/stints.test.ts`: validated/legacy/torn recovery records, phase folding and terminal history.
- `packages/server/src/stint-history.test.ts`: 24 native server-only SIGKILL cases (Claude/Codex × Installed/Bundled × TCP false/true × surviving/EOF/EOF-with-tool), same-session load/continuation, exact executable/environment, replay suppression, contiguous sequences/unique message/tool IDs, checkpointed partial/work/handoff files and zero recovery preparation/npm calls. EOF-with-tool must block. The legacy crash case already proves checkpoint followed by an explicit new stint preserving old files.
- That history suite also covers 13 failed-recovery variants; missing/changed CLI, host/lock/cache/session; missing/foreign/changed-branch worktrees; torn logs; saved handoff/findings/finalization and original Review commit; setup timeout/fallback crash; readiness during reservation and concurrent reads/reconnects; blocked mutations/live owners/concurrent servers; Stop during verification/load/permission/continuation and across a crash; graceful suspension/late callbacks; cleanup through successive crashes/reused PIDs; finish/Stop/failure/fallback before checkpoint; blocked cleanup/proof-write failure. `local-data.test.ts`, `checkpoint-handoff.test.ts` and `review-findings.test.ts` preserve risky-file exclusions/warnings, checkpoint contents, Review identity and stale-evidence rules.
- Agents/core `permission-restoration.test.ts` and history/permission HTTP suites cover selected-but-unwritten crash ambiguity, transport/receipt failure, old-attempt late receipts, Allow/Reject, stale/duplicate/invalid/origin refusals, new provider toolCallId preserving logical age, changed-content fresh consent, callback ownership and no-callback retirement/timeout. Explicit load/answer/write/turn signals and fake clocks cover human waits and remaining setup/after-turn budgets.
- Agents `process-ownership.test.ts` / `process-inspection.test.ts` cover deleted cwd, transient/exited/zombie Git children, verified server descendants, pre-attempt shells, reused identities, detached writers, bounded inspection and frozen-tree release. Existing web recovery/permission/stream/snapshot/catalog suites and Playwright `stint-recovery.spec.ts` / `drawer-and-needs-you.spec.ts` cover presentation/reconnect. No new browser harness is needed.

Only `stint-history.test.ts` is extended:

- Existing EOF crash cells now kill the server again **after the first replacement establishes continuation**. Both agents/sources, with/without TCP, must retain stint/session, use three distinct attempts, load twice, create one session and end once. Intermediate recovery cannot prepare/reselect; each load uses the recorded executable/environment. Existing stream/file/old-writer/no-download assertions remain.
- The existing fake native EOF scan table adds durable prefixes after reservation (`resuming`) and after replacement session persistence before the work-phase write. Each resumes once after proving all previous attempts absent, preserving prefix/files with zero preparation/npm calls.
- The existing four finalization outcomes additionally capture the log **after a real checkpoint commit but before `ended`**. Restart reuses the commit, never verifies/loads/launches, and appends one ending; another restart leaves terminal bytes unchanged. Before-checkpoint cases remain. History/replay now compares all finished/stopped/failed logs and interrupted fallback across two further startups.
- New waits use existing named-step/warnings/log-tail diagnostics; native matrix errors include crash number, child step/stderr, project warnings and final 12 entries. No sleeps, new harness/dependency, deadline changes, product changes or weakened Review/risky-file assertions.

#### Host lessons the coordinator must preserve

Ticket 05's final darwin-arm64/Node 22 installed-Claude runs demonstrated SIGTERM suspension and server-only SIGKILL recovery after fixing EOF/deleted-cwd/transient-Git/pre-existing-shell failures. Ticket 06 reports 2701 unit tests, 24 native crash cases, six repeated matrix runs, smoke/314 e2e passes, and real installed Claude 2.1.295/Codex 0.163.0 Ask runs. Ticket 07 records the subsequent UI/browser matrix and human review. These are **preceding-revision host evidence**, not passes for this delta or all four source cells.

- Answers **must carry the live `attemptId`** plus current requestId/actual optionId, and go to the callback-owning server. The coordinator's earlier omitted-attempt harness caused a false product report. Current live missing-attempt answers return 400; stale/non-owner/duplicate answers return 409. Never substitute logicalRequestId or toolCallId.
- In **bash**, capture Node's PID: `(cd "$RUN_PROJECT"; node "$CLI" --no-open >>"$SERVER_LOG" 2>&1 & echo $! >"$PID_FILE")`. `(cd dir; node ...) &` captures a wrapper subshell instead. Verify native command/start identity before signalling.
- Real Claude can reissue with a **new toolCallId** after continuation. Match normalized content/options and retain logical age. It may **not reissue at all**: the host's Claude Allow/SIGKILL case wrote nothing and retired the item at ending. Record no-callback/retired separately; it is not successful Allow delivery. If every attempt moves on, retain the live-rebind acceptance gap rather than enabling dead controls.
- Real ACP adapters exit on **stdin EOF** when only the server is SIGKILLed. Absence is expected; old writers must still be certified gone before replacement/checkpoint. A detached surviving tool blocks safely. Do not keep the real adapter artificially alive or group-kill it as exit proof.
- After **every run, including preparation failures**, check `ps` for state **T** and stray `stintwork-<uuid>` adapters, Codex app-server/git/network descendants and separate-session shells. Ticket 06 reports an older pre-fix frozen group at PIDs 32405/32456; those are historical identities, not authority to signal today's occupants. Retain provenance and have the maintainer resolve any surviving verified group.
- A **Spec-stage stint writes `spec.md`**, not an arbitrary marker requested inside it. Inspect the actual permission's file/command. Codex Reject on the host left `.scratch/<work-item>/spec.md` identical to the scope commit; Claude Allow checkpoint `52a73fa` added 43 spec lines. An absent arbitrary marker proves neither rejection nor delivery.
- Leave unrelated processes alive: deleted cwd, transient Git children and shells in the worktree **predating** the attempt must not block recovery. Same-second/later plausible writers, persistent unreadable same-identity cwd and marker/group/ancestry evidence still block; command names grant no exclusion. Detached writers outside all documented links remain outside the guarantee. Windows cleanup remains unverified/blocked.

#### Coordinator runbook: preparation and identity

Run the automated commands below on the exact rebuilt/packed revision, in disposable real Git projects. **Real-agent steps need the maintainer's existing logins and provider network; explicit cold preparation may need registry network.** Process/signals, sockets and browser steps need the coordinator host. Do not inspect credentials, sign in, alter global CLI/configuration or purge shared caches.

Retain `git rev-parse HEAD`, any uncommitted `git diff --binary`, build/pack output and tarball SHA-256, OS/architecture/Node. Set an absolute `CLI` to that revision's `dist/bin.js` or installed tarball bin. Use a separate evidence folder/project per scenario. Keep its project/worktree/local logs/cache/launcher environment unchanged across restarts.

Explicitly prepare **four source cells**, using process-local overrides on the server:

| Agent | Source | Override before explicit preparation |
| --- | --- | --- |
| Claude Code | Installed | `CLAUDE_CODE_EXECUTABLE=/absolute/path/to/current/claude` |
| Claude Code | Bundled | `CLAUDE_CODE_EXECUTABLE=/nonexistent/claude` |
| Codex | Installed | `CODEX_PATH=/absolute/path/to/current/codex` |
| Codex | Bundled | `CODEX_PATH=/nonexistent/codex` |

Preserve the maintainer's normal login environment. Optionally give each cell a **new private** `STINTWORK_AGENT_CACHE`. Explicitly warm the selected source through normal Start/preparation in a warm-up project and end it before crash checks. Installed incompatibility falling back to Bundled does not pass Installed. Verify Bundled is actually recorded. Recovery must retain these same overrides/cache, never repair/reselect to rescue the session.

Retain `started`, `launch`, `attempt`, `session`, phase and permission entries: source/reason, canonical executable/version/file identity, adapter entry/version, cache key, released lock digest/host identity, server/adapter PID/native start/title/group and traceable tools, brief/start/base/reviewed commit and worktree/branch. Re-record current versions; historical versions are not assumptions. Obtain lock hashes from the actual released profile. Record relevant non-secret configuration identity, never an environment/credential dump.

Launch in bash with absolute scenario paths:

```bash
# SOURCE_ENV is a bash array, e.g. (CODEX_PATH=/nonexistent/codex).
(cd "$RUN_PROJECT"; env STINTWORK_AGENT_CACHE="$RUN_CACHE" "${SOURCE_ENV[@]}" \
  node "$CLI" --no-open >>"$SERVER_LOG" 2>&1 & echo $! >"$PID_FILE")
SERVER_PID=$(cat "$PID_FILE")
ps -p "$SERVER_PID" -o pid=,ppid=,pgid=,uid=,stat=,lstart=,command=
```

Read the actual URL from server output (busy-port fallback can change it), and verify health/project/history identify the intended project. Every observation loop must name its step and have a diagnostic deadline: `initial work edit`, `old writer exit`, `live callback`, `receipt`, `terminal checkpoint`. On failure retain stderr, available non-secret ACP trace, project warnings, final 12 JSONL entries and native process/cwd evidence. Fixed sleeps do not prove a boundary. Setup is bounded to 60 seconds excluding real live human waits; ordinary work/human answers have no new total deadline. A harness observation limit is not permission to fabricate success.

#### Coordinator runbook: active work and two successive restarts

For **every agent/source cell**, start an observable multi-step file-editing stint with time to kill during work. Use normal UI/`POST /api/stints` with `{workItem, agent, permissionLevel}` (a real ticket only for an Implement ticket stint). Wait for durable session/work phase **and actual mid-work edits/stream/tool activity**, not a completed recall. Save log prefix, project/history, HEAD/files, IDs and native process/cwd table.

1. Send `kill -KILL "$SERVER_PID"` to the verified **server alone**. Retain command/exit evidence; never kill the group/adapter/tool as the crash action. Observe EOF exit or verified cleanup of old writers. Capture `ps -axo pid,ppid,pgid,uid,stat,lstart,command` and targeted cwd evidence (`lsof` on macOS, `/proc/<pid>/cwd` on Linux). No replacement/checkpoint may overlap a possible writer; unrelated processes survive.
2. Restart the same revision/project/cache/environment. Board/health/history remain usable while recovery reserves the work item. Start/checks/gate approval/agent changes/Review writes/ship refuse conflicts. Repeated reads/WebSocket reconnects cannot create another attempt. Retain cleanup proof, `resuming`, new attempt/session record, `resumed`, same-session `loadSession` and fixed continuation trace, original mode/Git roots, unchanged stint/start/worktree/brief/base/reviewed commit and different native adapter identity. Require **zero recovery `newSession`, original brief/skill replay, setup/dependency work, preparation/download/reselection or registry traffic**. Measure the recovery window separately from explicit preparation, retaining process/npm/network/trace evidence; absence of a spinner is insufficient.
3. While the replacement is visibly working and `resumed` is durable, **SIGKILL the server again**, then restart before ending. Require three distinct attempts, two same-session loads/continuations, no intermediate checkpoint/ending and one eventual parsed handoff/checkpoint/ending under the original stint ID. Earlier log bytes, live sequences and replay agree without duplicate attention/output. Verify `git show` contains pre-crash, continuation and handoff-turn edits.
4. In a fresh scenario repeat with `kill -TERM "$SERVER_PID"`. Await exit/old writers gone: `suspending → cleanup → suspended`, with no handoff prompt, developer rejection, checkpoint or ending merely from shutdown. Restart to normal continuation/ending. Include handoff/Review findings and saved finalization: request only missing output; saved finalization needs no implementation/new writer. Preserve reviewed commit/stale evidence and risky-file exclusions/warnings.
5. After ending, restart/read twice and compare terminal bytes/checkpoint SHA; exactly one ending remains. Perform the stopped/stray audit below after every scenario.

#### Coordinator runbook: pending Ask Allow/Reject

Run **Claude/Codex × Installed/Bundled × SIGKILL/SIGTERM × Allow/Reject**: 16 fresh scenarios, using maintainer logins/provider network. At Ask, wait for a real manual request and save full normalized details/options, original raisedAt, old request/tool/logical/attempt IDs and baseline content/hash of the **actual requested** file/command target. For Spec, commit the intended `.scratch/<work-item>/spec.md` scope before starting and compare that file with this scope commit.

1. Restart at the pending request. In two tabs retain reconnecting with original age/details/options and **disabled** buttons. A non-owner server's queue **and drawer** stay unanswerable and append nothing. Save project/history and screenshots before/after binding.
2. Wait for a matching **live callback**, allowing a new provider toolCallId. Matching normalized content preserves one logical item/age; changed content/options needs fresh consent and stale-item retirement. A formerly manual request cannot become auto-approved under Edit freely. No callback means retirement at turn resolution or bounded reconciliation fallback: retain the outcome and absence of effects, never post saved consent to dead transport or count retirement as delivery.
3. POST to the **owner URL**, `/api/stints/<stintId>/permissions/<current-requestId>`, with JSON content type, matching Origin and body `{"optionId":"<actual-current-option>","attemptId":"<live-attempt>"}`. Select actual `allow_once`/`reject_once` kind, not a guessed option name (Codex Reject may use optionId `cancel`). Retain exact non-secret body, owner PID/destination, IDs and HTTP response. Observe selected decision, current transport receipt, durable `permission_delivery: written` and queue removal. Selection alone is not delivery; written receipt alone is not tool execution.
4. Duplicate/stale old-attempt/reused-ID answers return 409 with no extra write. Current live missing-attempt returns 400, invalid-option 400 and foreign Origin 403 without consuming the callback. For Allow independently inspect the requested file/command effect and checkpoint. For Reject prove the denied rewrite/command never occurred via scope blob/content/diff and side-effect target, not merely a handoff or absent arbitrary marker.
5. Selected-before-written crash ambiguity is deterministically covered by the existing tests. If the real transport exposes that observable point, retain a server-only kill there; do not claim a tiny real boundary from a timed sleep. Reissued uncertain selections require consent again. Hold a genuinely rebound handoff/findings request past the default 90-second collector processing budget, then answer Allow/Reject and verify remaining processing can finish. Include Stop while reconnecting/live: durable Stop before cancellation, no later work, cleared bindings and one checkpoint/ending with existing Stop handoff/findings behavior.

#### Coordinator runbook: forced fallback, ownership and new stint

For each agent/source, leave pre-crash partial work, then force a local recoverability failure using only a **scenario-private prepared cache**: after old writers are confirmed gone, rename its recorded entry and retain it for evidence. Restart unchanged. Expect concrete missing-cache fallback, zero preparation/download/source switch, no ACP launch, one interrupted ending and a checkpoint preserving partial files, without invented handoff. Existing fake variants cover actual load/auth/provider/mode/transport failures; do not log out or edit credentials to force one.

Restore only the scenario's renamed private entry after fallback. Explicitly choose **Start new stint**/brief preview from the recorded checkpoint. Require a new stint/session, old files intact, new brief tied to the checkpoint and old terminal bytes unchanged. This is developer action with normal preparation, not automatic retry. Missing/foreign worktrees remain unmutated; checkpoint errors cannot invent a commit.

Keep an older worktree shell and unrelated deleted-cwd process alive, and generate transient Git children: they must not block clean recovery. A deliberately later plausible writer must block with PID/cwd guidance and no replacement/checkpoint; stop it only after matching test provenance, then restart. Run concurrent-owner tests unfiltered and open a second server: only the owner mutates/answers in both queue/drawer. Refused actions, repeated reads/reconnects/Stop/shutdown must not create a second writer/ending.

#### Evidence, browser review and cleanup after every run

Retain per-cell/scenario actual pass/fail/no-callback/blocked outcomes and artifact paths:

- Revision/diff/build/pack hashes/commands; OS/architecture/Node; source/reason/executable/version/file identity, adapter/cache/lock/host identity. Server stdout/stderr and available non-secret ACP trace, without credentials/environment dumps.
- Original/replacement server/adapter/tool native identities, attempt/session/stint/request/logical/tool IDs, kill point/signal, `ps` before/after every restart/ending, cwd scan and warnings. Include preparation failures **without stint logs**: Installed preparation opens a no-work session before worktree/start-log creation.
- Original prefixes/full final JSONL, API snapshots, exact answer requests/responses/receipts, WebSocket sequences/replay, load/continuation and zero-recovery npm/registry evidence, parsed handoff/results, scope/base/reviewed/checkpoint commits and `git show`/content proof of allowed/denied effects. One ending/immutable terminal bytes must be independently checkable.
- Screenshots of Pipeline/drawer/source details, reconnecting/live/answering/error, Stop, resumed/history read-only replay, owner warning and fallback/checkpoint failure in en/zh-CN. Run ticket 07's 1440/1024/768/390px plus 360px, light/dark at 1440/390px; retain human review at **1440/390px in both languages**, keyboard/focus and real two-tab WebSocket reconnect. Keep Review/risky-file disabled-control assertions and labelled path checks. Review PNGs: `packages/web/coverage/e2e/test-results/<test-case>/stint-recovery-review/`; retain failure DOM/fixture/trace too. Mocked e2e does not replace real-agent UI acceptance.

After **every run/preparation failure**, save `ps -axo pid,ppid,pgid,uid,stat,lstart,command`, inspect **all state-T rows** and **all `stintwork-<uuid>` adapters**, following owned descendants across process groups. Match native UID/start/marker/ancestry/provenance before cleanup. Confirm no owned stopped process/stray adapter/tool remains and unrelated processes survive. Uncertain ownership requires retained guidance and maintainer resolution, never blanket kills or historical PIDs. Unresolved owned leftovers fail cleanup acceptance.

Ticket 09 retains missing-resource/platform limits. Only the maintainer's accepted full exit, after 01–08 resolve, sets M10 shipped; this work leaves it active. Old recall probes, whole-group kills, fake tests and ended-before-kill sessions do not pass the real exit. Grok stays experimental/fallback; publishing is outside scope.

#### Exact coordinator automated commands and exclusions

On a native/socket-enabled POSIX host with native file watching, run **without filters**:

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run --configLoader native
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false smoke:package
pnpm --config.verify-deps-before-run=false test:e2e
# Repeat at least six times; all 24 cells must execute, not silently skip.
pnpm --config.verify-deps-before-run=false vitest run packages/server/src/stint-history.test.ts \
  --configLoader native --testNamePattern='server-only SIGKILL'
```

Require all 24 crash cases (the eight EOF cells now include a second crash), all 13 failed-recovery cases, and the full HTTP/WebSocket/native preparation cases to execute. Specifically deferred here:

- Agents `adapter-cache.test.ts`: nine native prepared-launch cases selected by `installed preparation, handshake, cache-only launch`, `stint-start handshake receives the explicit executable`, `offline installed/bundled warm reuse`, `bundled smoke and cold/warm stint launches`, `real fake-ACP handshake failure` (both agents where parameterized). CLI `cli.test.ts`: busy-port fallback.
- History: 44 cases — 24 native server-only SIGKILL cells; 13 failed-recovery variants; saved handoff/findings phases; both slow-startup transport cases; legacy TCP SIGKILL fallback; fallback checkpoint errors; graceful suspension/continuation. The fake native reservation/load-prefix and finalization boundary cases ran locally.
- `stints.test.ts`: 11 — eight prepared source/agent/session-write cases, HTTP stream start, rich-event pending-permission broadcast/answer and HTTP preparation disconnect. `stint-permissions.test.ts`: Needs-you two-tab snapshots and real HTTP immediate answers. `checkpoint-handoff.test.ts`: durable HTTP/WebSocket ending; `stop-and-failure.test.ts`: WebSocket Stop mid-turn.
- Other server sockets: all nine listener/watcher/WebSocket cases in `index.test.ts` (its two socketless cases ran); WebSocket cases in `agent-registry`, `checks`, `claude-code`, `create-work-item`, `grok`; two `superseded-handoffs` `WebSocket: true` cases; two worktree ticket push cases and the main-spec divergence push in `work-item-files`. Run their full files, not a route-mocked substitute.
- `smoke:package` needs an external packed consumer/install and HTTP socket; Playwright needs sockets/browser. Neither is executed here. All real-agent/provider/registry runs, native cleanup and real UI screenshots/human review above remain coordinator work. Package smoke's optional `--offline` avoids registry only when its dependency store is already warm; it still needs sockets.

#### Checks actually run in this sandbox

Final commands/results and logs are recorded below. These commands deliberately exclude only the native/socket dependencies enumerated above; watcher tests use polling to avoid this sandbox's native-watcher limit.

```sh
pnpm --config.verify-deps-before-run=false format:check
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false vitest run packages/core packages/agents packages/git packages/cli packages/web \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:installed preparation, handshake, cache-only launch|stint-start handshake receives the explicit executable|offline installed/bundled warm reuse|bundled smoke and cold/warm stint launches|real fake-ACP handshake failure|cli falls back to the next free port))'
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run \
  packages/server/src/{stint-history,stints,stint-permissions,stop-and-failure,checkpoint-handoff,review-findings,local-data}.test.ts \
  --configLoader native \
  --testNamePattern='^(?![\s\S]*(?:TCP: true|failed recovery |saved handoff phase|saved findings phase|slow startup leaves|fallback checkpoint errors|graceful suspension keeps|Needs-you snapshots reach both tabs|real HTTP answers|WebSocket|HTTP and|session write failure|rich events and pending permission frames|HTTP preparation disconnect))'
```

- Format/lint/workspace typecheck passed. Format checked 393 files; lint checked 345 licence headers / 394 Biome files, with only the pre-existing informational `biome.json` migration notice. Logs: `/tmp/m10-08-{format,lint,typecheck}.log`.
- Non-server: **122 files / 2,104 passed / 10 deferred**. Log: `/tmp/m10-08-nonserver.log`.
- Seven affected server files: **180 passed / 59 deferred**, including **92/136** history cases, all local-data risky-file and Review findings tests. Log: `/tmp/m10-08-server.log`. Focused finalization/history run: 9 passed; fake native scan/prefix table: 6 passed. Logs: `/tmp/m10-08-boundaries.log`, `/tmp/m10-08-prefixes.log`. These focused passes overlap the broad run and are not additional unique tests.
- Standard `pnpm --config.verify-deps-before-run=false build` failed with sandbox `EPERM` when Vite tried writing `packages/web/node_modules/.vite-temp/...` through the inherited dependency link into the main checkout. No permission escalation or main-checkout mutation was used. The equivalent local build below **passed**, followed by `node --check dist/bin.js` and `node --check dist/prepare-agent.js`. Log: `/tmp/m10-08-build-local.log`; original failure: `/tmp/m10-08-build.log`. Existing Radix `use client` and Vite chunk-size warnings remain informational.

```sh
pnpm --config.verify-deps-before-run=false --filter '!@stintwork/web' -r build
pnpm --dir packages/web --config.verify-deps-before-run=false exec vite build --configLoader runner
node scripts/build-package.mjs
node --check dist/bin.js
node --check dist/prepare-agent.js
NODE_OPTIONS=--conditions=development pnpm --dir packages/web --config.verify-deps-before-run=false \
  exec playwright test stint-recovery.spec.ts drawer-and-needs-you.spec.ts --list
```

Playwright **listed 48 cases in two files**, without browser execution/screenshots (`/tmp/m10-08-browser-list.log`). No real-agent, native-process, socket, network, browser, package-smoke or M10 exit pass is claimed locally. The standard build, smoke and full browser commands still need the coordinator host.

All remaining available server files also passed: **28 files / 366 passed / 10 socket cases deferred** (`/tmp/m10-08-other-server.log`). The two socketless index cases passed separately (`/tmp/m10-08-index-socketless.log`); its nine socket cases remain deferred. Exact commands:

```sh
CHOKIDAR_USEPOLLING=1 pnpm --config.verify-deps-before-run=false vitest run packages/server \
  --configLoader native \
  --exclude 'packages/server/src/stint-history.test.ts' \
  --exclude 'packages/server/src/stints.test.ts' \
  --exclude 'packages/server/src/stint-permissions.test.ts' \
  --exclude 'packages/server/src/stop-and-failure.test.ts' \
  --exclude 'packages/server/src/checkpoint-handoff.test.ts' \
  --exclude 'packages/server/src/review-findings.test.ts' \
  --exclude 'packages/server/src/local-data.test.ts' \
  --exclude 'packages/server/src/index.test.ts' \
  --testNamePattern='^(?![\s\S]*(?:the WebSocket snapshot|output is streamed over|WebSocket snapshots publish|creation broadcasts|a Grok login attention|WebSocket: true|worktree ticket edits push|main spec edits push))'
pnpm --config.verify-deps-before-run=false vitest run packages/server/src/index.test.ts \
  --configLoader native \
  --testNamePattern='server reports a missing web build clearly|the project app can be queried without opening a socket'
```

Together the disjoint broad groups cover **158 files / 2,652 passed / 88 deferred**, without counting overlapping focused reruns again. Both socketless superseded-handoff cases ran, rather than being accidentally filtered by the word WebSocket. The changed native matrix child's generated module syntax was checked without executing it; its real native/two-restart behavior remains coordinator-run. `git diff --check`, append-only ticket/unchanged pre-Comments and acceptance content, all changed-file `Status:` lines, exact two-file scope and branch guards passed. No commit.

**Coordinator, 2026-10-26:** Verified on the native socket host (darwin-arm64, Node 22).

- **Checks:** format:check, lint, typecheck, build, 2740 unit tests (all native/socket cases included), smoke:package and 334 e2e tests pass.
- **Crash matrix:** the 24-case server-only SIGKILL matrix passed 24/24 in six repeated runs, as the runbook requires. No stopped processes were left.
- **Review:** clean.
- **Status:** the runbook above is the procedure for ticket 09. Nothing in this ticket counts as the M10 real exit. Resolved.
