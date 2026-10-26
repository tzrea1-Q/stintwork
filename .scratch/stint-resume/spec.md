# Stints survive restarts

Status: ready-for-agent

Milestone: M10 · Stints survive restarts

See `docs/plan.md` (v0.2, M10), `docs/brief.md` (§8, §9, §11), `GLOSSARY.md`, ADR 0002, 0003, 0004, 0009 and 0011. The ticket format and coordinator evidence boundary follow `.scratch/first-run/`.

## Problem Statement

A server restart currently ends the active stint. The developer can start another stint from the recorded state, but loses the agent's conversation and any permission request that was waiting. M10 keeps the same stint and ACP session across a new agent process, without asking the developer for another brief.

Current flow, inspected at `d530b79b006593d8a8e86465dad2fa2cd5196b96`:

- `packages/server/src/stints.ts` prepares the selected agent, creates or reuses the work item's worktree, commits Stintwork setup, compiles the brief and writes a `started` entry. That entry records the stint/work item/stage/ticket/agent, worktree, base commit and brief. Agent source, reason, executable and adapter version are only human-readable stream messages, not validated recovery data.
- `packages/agents/src/index.ts` launches the adapter, initializes ACP, always calls `newSession`, sets the permission mode and sends the brief. The ACP session ID stays in the launcher's `acpId` variable. Streaming events are appended to `.stintwork/local/stints/<id>.jsonl` in the project checkout and broadcast to the browser.
- On an ordinary finish or explicit Stop, the launcher collects the handoff (and Review findings when requested), closes its process and resolves `done`; the server then checkpoints and appends `ended`. This is the actual ordering, including handoff-turn edits in the checkpoint, despite brief §8 describing checkpoint before handoff. An agent failure can end without a handoff. M10 preserves the ordinary ending flow and ADR 0004's checkpoint guarantee.
- `createProjectServer.initialize()` in `packages/server/src/index.ts` calls `recoverInterruptedStints` before API requests and before `start()` completes. `packages/server/src/stint-history.ts` checkpoints each unowned log still folded as `running` and appends `ended: interrupted`, with no handoff. Graceful `stop()` also cancels, waits and records an interrupted ending. There is no ACP resume attempt.
- Recovery verifies the logged worktree against this project's Git worktree registry and `stintwork/<work-item>` branch before checkpointing. Missing or foreign worktrees produce an interrupted ending with an explicit checkpoint error. The parser in `packages/core/src/stints.ts` skips invalid lines with warnings; recovery preserves a torn final line and separates the next append with a newline. A log without a usable `started` entry cannot become a stint.
- Permissions are logged with request/tool identities, details and actual options, but `packages/server/src/stint-permissions.ts` keeps the callback and delivery receipt in memory. `deriveAttentionItems` only surfaces pending permissions on a running stint; an interrupted ending removes them from Needs you. The stream and history UI also distinguish live permissions from read-only replay.

The 2026-10-09 ACP spike passed new-process resume for all three agents. More relevant pinned-pair evidence is the final coordinator comment and evidence table in `.scratch/first-run/issues/03-installed-cli-compatibility.md` (2026-10-17): `loadSession` resume passed with Claude Code Installed 2.1.295 and Bundled 2.1.293, adapter 0.88.0; Codex Installed 0.163.0 and Bundled 0.159.3, adapter 2.1.1. Those darwin-arm64 probes restored a session and recalled HERON after a new prompt. They do not prove continuation of a killed server's active turn, restored permission delivery or other platforms. Grok remains experimental; its old spike is not current end-to-end evidence.

## Solution

Automatically attempt resume once at startup for each eligible unfinished Claude Code or Codex stint, using its recorded executable and verified warm adapter cache. Keep the stint ID, worktree, original brief and ACP session ID. Send a small continuation instruction in that session, never a newly compiled brief or the original skill command. Restore a waiting permission in Needs you, but enable answers only when a new live ACP request can receive them.

Recommend automatic recovery over a developer Resume action: restarting the local server should restore work already explicitly started, including work whose browser is closed. Requiring a click would leave the exit dependent on another developer action. Recovery is bounded, visible and stoppable, does not download anything, and never launches two writers on one work item. A failed resume ends at the existing checkpoint fallback; starting a new stint remains the developer's action.

## User Stories

1. As a developer, I want an active stint to continue after restarting Stintwork, so that I do not write another brief or lose its conversation.
2. As a developer whose agent was waiting for permission, I want the request back in Needs you, with the same details and a working answer, so that a restart neither grants permission nor loses my decision point.
3. As a developer, I want to see recovery progress and be able to Stop, so that automatic recovery stays understandable and under my control.
4. As a developer whose session cannot be loaded, I want the partial work checkpointed and the reason shown, so that I can start another stint from the recorded state.
5. As the maintainer, I want real crash evidence for Claude Code and Codex, separate from fake-process tests and old probes, before calling M10 shipped.

## Implementation Decisions

### Decision record first

Ticket 01 writes a new decision record (next available number, currently 0012) before implementation. It records automatic recovery and defines restart as suspension of an unfinished stint, rather than an ending under ADR 0004; genuine endings still checkpoint. It narrowly qualifies ADR 0011's startup rule: recovery may verify and launch an already prepared recorded selection, but must not call first-use preparation or download/reselect agents. Board detection and availability refresh remain read-only. Preserve ADR 0002's pinned ACP contract, ADR 0003's own-login/no-credentials boundary and ADR 0009's worktree authority. Do not silently rewrite existing records. Coordinator approval of the new record is an implementation prerequisite, not a claim made by this spec filing.

### Persist only what recovery needs

Extend the existing gitignored per-stint JSONL log with validated, versioned recovery entries; no database, committed session IDs, duplicate transcript store or serialized promises. Derive pending requests and current phase by folding those entries. A fresh stint must persist the following before its first work prompt; persistence failure prevents that prompt:

| Record | Required data and purpose |
| --- | --- |
| Existing `started` | Stint/work item/stage/ticket/agent, canonical worktree path and branch, base commit and original brief. Reuse these fields; do not regenerate them on recovery. |
| ACP session | Session ID from the successful `newSession` response, mapped to this stint; persist before the first prompt, even if later mode setup fails. No attempt to discover an ID by guessing or listing unrelated sessions. |
| Selected launch | Agent ID; Installed or Bundled source and selection reason; canonical executable path, version and file identity; pinned adapter version/entry, cache key and released lock digest, including host compatibility. Reuse `PreparedAgent` and cache verification semantics from M9. Never persist environment variables, credentials or login data. |
| Lifecycle progress | Process-attempt identity and ownership, suspension/resume attempt and outcome, durable Stop intent, and phase: work, handoff, Review findings or finalization. Store completed after-turn results before moving to the next phase. This avoids rerunning implementation after a crash during handoff or checkpointing. |
| Pending permission | Existing request ID, tool call ID, title/kind, full logged details, actual option IDs/names/kinds, automatic/manual flag and original raised time. Add current-attempt binding and response-delivery state. The callback/receipt itself is recreated, never stored. |

Keep earlier log entries byte-for-byte, make new appends newline-safe and keep parse warnings. Old logs without the new metadata still read normally and take today's interrupted/checkpoint fallback. A torn/invalid recovery record or ambiguous control history is ineligible for resume; preserve readable history and fall back rather than guessing a session, phase or permission answer. Logs without a usable start remain warnings only. A completed `ended` entry is terminal and is never reopened.

### Startup, ownership and continuation

1. Discover unfinished logs once per server lifetime. Reserve each eligible work item before asynchronous work, so a concurrent Start, checks, gate approval, agent change, review write or ship cannot race recovery. Repeated API reads and WebSocket reconnections do not initiate another attempt. Concurrent servers must respect ownership; a live owner is not interrupted by another server.
2. Verify the worktree using the existing canonical-path/Git-registry/branch checks, base-commit ancestry and current work item/stage association. Dirty files and commits made by the interrupted agent are expected; do not reset, recreate the worktree, reinstall dependencies, recommit setup or overwrite planning files in the main checkout. Missing, foreign, changed-branch or superseded work items cannot resume.
3. Verify the recorded cache entry and executable identity locally, using the M9 ownership/integrity checks, without `prepareAgentForStint`'s new-session handshake or npm. Use the exact recorded selection. Changed/missing CLI, adapter/lock/host mismatch, corrupt or missing cache means fallback. Never replace Installed with Bundled, switch agents or select another PATH executable to rescue an old session. A later explicit new stint may use ADR 0011's normal preparation/selection.
4. Before a replacement process or fallback checkpoint can write, establish that the previous adapter process group and traceable tool descendants have stopped. Preserve process-attempt ownership sufficient to distinguish a stale PID from this stint's process; never kill by a bare logged PID. Use bounded cleanup of verified owned processes. If an owner is still live or cannot safely be identified, block recovery and mutations with a project warning and concrete cleanup guidance; do not launch or checkpoint alongside it. If the recorded owner and adapter have disappeared or their PIDs were reused, startup may persist cleanup proof only after a bounded native process/cwd scan finds no recorded group members, attempt markers, previously observed descendants or same-UID processes with cwd inside the recorded or canonical worktree paths that are not proven to predate the recorded adapter attempt. This age exception applies only to cwd evidence and requires stable native identities with a start second earlier than the adapter's recorded native start time. Same-second or later starts, and unparseable or ambiguous start times, remain possible writers; command names never grant an exclusion. Compare deleted cwd paths lexically too; a missing worktree uses its recorded path for this check before the existing non-mutating interrupted-ending fallback. Plausible writers are named and block recovery; this scan never authorizes signalling them. Unavailable/incomplete inspection also blocks recovery. No reattachment or process supervisor is introduced.
   **Known limit:** Cleanup stops the adapter's process group and descendants still traceable through recorded ancestry; after the recorded owner and adapter disappear, startup also checks for reparented writers by marker, group and same-UID worktree cwd, excluding cwd-only candidates proven to predate the attempt. Processes that leave all those observable links, including detached tools writing through open files or absolute paths from another cwd, remain outside this guarantee. Writes delegated to pre-existing processes are also outside the adapter-descendant cleanup guarantee.

5. Launch a new agent process through the registered launcher's configured environment, overriding only the recorded selected executable. Initialize ACP, require the advertised `loadSession` capability, call `loadSession` with the saved session ID, worktree and required writable Git directories, and restore the original Stintwork permission level/mapped mode before continuing. Unsupported load or mode/directory support is a failure, never permission widening. Listing sessions or the experimental `resumeSession` method is not a substitute.
6. Loading may replay conversation updates. Keep the existing log authoritative; do not append replay as new output, reissue side effects or create duplicate attention. Scope fresh message/tool/request identities to the process attempt so reset counters (currently message IDs start at 1) cannot overwrite earlier content. A reissued live permission callback is handled as below, even if it arrives during load.
7. After loading, if the saved phase is work, issue one fixed continuation instruction: “Continue the interrupted turn in this session from the current worktree. Read current project files where needed; they remain authoritative. Do not restart the stage skill or repeat completed work.” This is an ACP prompt in the existing session, not a new brief or a replay of the first prompt. `loadSession` alone restores history and does not prove that a turn continues. If a live request is already waiting, service it before an additional work prompt. If the saved phase is handoff or findings, request only the unfinished after-turn output using the existing request/parser; finalization with saved results only needs a checkpoint and ending.
8. Preserve the original stint ID, started time, base/reviewed commit and brief. Append recovery progress and continue the live stream with sequences beyond the saved entries. Snapshot/replay and WebSocket reconnect must agree. At a genuine end, collect remaining handoff/findings and use the existing checkpoint, risky-file warnings and ending flow exactly once. Review evidence stays tied to its original reviewed commit and existing staleness rules.

Queue recovery after local discovery/reservation; do not hold server readiness or every `/api/*` request behind an agent handshake. The board, history and health remain usable during recovery and failures are per stint. Allow 60 seconds for initialization/load/mode setup, excluding time explicitly waiting for the developer on a live permission. After-turn work retains the current configured timeout. Do not add a total work-turn timeout. Each startup makes at most one attempt per candidate, without retry loops or new-session fallback. A subsequent crash of a successfully resumed active stint is eligible on the next restart; an already recorded failed attempt is terminal once fallback ends it.

### Shutdown and explicit Stop

Graceful server shutdown suspends an eligible active stint: record the last phase and recovery data, detach live permission bindings and terminate its process with bounded cleanup. Do not request a handoff, checkpoint, append `ended` or record a developer rejection merely because the server is stopping. A hard kill leaves the last durable state for the same startup path. If the stint has already genuinely ended, complete its existing finalization rather than turn it back into active work.

Explicit Stop remains an ending. Only suspension aborts after-turn collection; no later handoff/findings prompt is sent once suspension starts. Explicit Stop still collects the requested handoff and Review findings before checkpointing. Persist Stop intent before cancellation so a crash during Stop never resumes the work. Stop also works during recovery and while waiting for permission: abort load/continuation, clear live requests, finish bounded process cleanup, checkpoint and record a stopped ending. A recovered Stop intent or old finalization phase finishes recording that ending instead of loading work. One work item has at most one writer and one terminal log ending, including repeated Stop/shutdown calls.

### Permissions survive; callbacks do not

Reconstruct each unanswered manual request in Needs you with its original age and details while recovery is in progress. Show it as reconnecting and disable answer buttons until the new process issues a matching live callback. Never send a saved answer to a dead transport. Requests with an uncertain delivery (including a selected decision logged before the current receipt was written) must not be silently treated as granted or automatically replayed.

When the agent reissues the tool request, bind it to a new current-attempt request ID and receipt. Correlate the old logical request only when tool identity and normalized details/options agree; retain the original raised time and show one item. Changed options/details are a fresh request requiring fresh consent. Keep old records as history, mark stale bindings unavailable, and reject old-attempt POSTs with 409 even if an ID was reused. A previously manual pending request must not become auto-approved by the normal edit-freely policy during recovery.

The developer chooses from the current agent's actual options, with the same duplicate/invalid-option and origin checks as today. Keep the item pending/answering until the response is written to the current ACP transport; persist that delivery outcome. A written response is not proof that a tool executed. If a crash leaves delivery ambiguous and the agent asks again, ask the developer again. Do not promise exactly-once external tool effects across a provider crash.

For a saved pending request, reconciliation stays part of the 60-second recovery setup allowance until a fresh callback returns or the first resumed turn completes and retires it as no longer pending. If neither happens within that allowance, fail recovery rather than leave an unanswerable queue item forever. This bounds reconnection of a saved permission, not ordinary work turns. Waiting on an actual rebound callback has no human-answer timeout. Ending/fallback clears all pending bindings; no cancelled/answered/automatic historical request reappears as actionable.

### Failure and recorded-state fallback

A failed resume includes missing/invalid session metadata; an unsupported recovery format or ambiguous/torn log; missing/changed executable or cache identity/integrity; unsafe/missing worktree; unsupported `loadSession`; load rejection/session not found; authentication/provider/network error; setup timeout, mode/directory mismatch or process/transport exit before continuation is established. Grok's policy skip and legacy logs also use fallback, with a distinct explanation rather than claiming `loadSession` failed. Recorded attempts without prepared-adapter ownership metadata use the same bounded native absence scan with available owner/adapter identities and marker/group/cwd evidence, without authorizing signals. A live recorded PID without a saved identity remains unverifiable, and a missing adapter start identity cannot grant the pre-attempt age exclusion. Logs without attempt records retain the existing legacy fallback.

On failure, stop and await the replacement process, invalidate permissions, then reuse verified-worktree checkpoint recovery and append one interrupted ending containing the precise resume reason, checkpoint result and warnings. Checkpoint errors remain explicit with no invented commit or handoff. Missing/foreign worktrees are never mutated. Other history and work items stay usable. A live ownership conflict is blocked, as above, rather than forcibly ended. A crash during fallback finalization must not restart implementation on the next boot.

Offer the existing new-stint/brief-preview path from the recorded checkpoint and latest real handoff if one exists; do not fabricate a handoff for a crash, automatically start another stint, or auto-retry after login/network recovery. Auth failures also use the existing login attention item and the developer's login command. Failure of the resumed work after setup follows normal failed-stint ending semantics. Missing/invalid handoff or findings after an otherwise successful continuation follows today's ending/error rules and does not trigger a second resume.

### Developer-visible states in both languages

Keep lifecycle status `running` for the same unfinished stint and expose a recovery phase in snapshots/history; do not invent a stage, ticket status or gate approval. These are product copy requirements, rendered through both catalogs and the existing core-text wire format. Agent-authored content and actual option names stay unchanged.

| Surface/state | English | 简体中文 |
| --- | --- | --- |
| Active stint during setup | Resuming stint… | 正在恢复 Stint… |
| Stream/history recovery marker | Stint resumed after server restart | 服务器重启后已恢复 Stint |
| Restored permission before live binding | Reconnecting permission request… | 正在重新连接权限请求… |
| Rebound permission | Waiting for your permission | 等待你批准权限请求 |
| Queue label | Needs you | 待你处理 |
| Stop during recovery | Stop stint | 停止 Stint |
| Failed resume with checkpoint | Could not resume stint. Changes saved at checkpoint {commit}. Start a new stint from the recorded state. | 无法恢复 Stint。更改已保存到检查点 {commit}。请从已记录的状态开始新的 Stint。 |
| Checkpoint failure | Could not resume stint or create a checkpoint. Your files remain in {path}. {reason} | 无法恢复 Stint，也无法创建检查点。文件仍保留在 {path}。{reason} |
| Existing next action after fallback | Start new stint | 开始新的 Stint |
| Experimental policy | Grok Build is experimental; restart recovery uses a checkpoint and a new stint. | Grok Build 为实验性支持；重启后将通过检查点和新的 Stint 继续。 |

Show the concrete recovery reason and recorded Installed/Bundled source, executable/version and adapter in existing details, rather than replacing them with a generic error. Legacy metadata absence and owner conflicts need translated reasons. Stop is available while loading; Start and conflicting actions remain unavailable until the active stint ends or ownership is safely released. History replay always has read-only permission controls. A successful automatic resume itself raises no attention item; only a real permission, login or existing warning needs attention. Ownership/log problems are project warnings, not invented permission items.

### Grok Build

M10 does not automatically resume Grok. Keep its native `grok agent stdio`, config warnings and experimental label; checkpoint an interrupted Grok stint and offer a new stint from recorded state. Do not download Grok, change its permission config or treat the 2026-10-09 resume pass as current permission/end-to-end verification. Add a fake regression for this policy. Current real Grok verification and any promotion to automatic recovery belong to M12; Grok rate limits do not block M10's Claude/Codex exit.

## Testing Decisions

- **Docs now:** run `pnpm --config.verify-deps-before-run=false format:check`, `pnpm --config.verify-deps-before-run=false lint` and `pnpm --config.verify-deps-before-run=false vitest run packages/core --configLoader native`. Repo-backed tracker tests assert parsing, no warnings and dependency order, never exact ticket counts/statuses. Markdown scope, section/field/checkbox counts and whitespace need separate checks because Biome does not cover these files.
- **Per-ticket automated checks:** extend the existing fake ACP and isolated Git/cache fixtures, not a second test framework. Cover live session persistence before prompting, exact source/environment, new-process load with no `newSession`/new brief, phase-aware handoff/findings, durable Stop, warm-only startup, legacy/torn/missing/foreign logs, duplicate startup/ownership, stale IDs, permission receipt ambiguity and fallback/checkpoint errors. Run affected core/agents/server/web tests plus format/lint/typecheck; record commands and exclusions.
- **Coordinator-run sockets:** real HTTP/WebSocket restart/reconnect and SIGKILL lifecycle tests need socket/process access. Reuse `stint-history.test.ts`'s killed-server fixture and existing e2e harness. Kill only the server for the main crash case, proving the old adapter/tools stop or safe ownership blocks replacement; killing the whole process group alone does not prove this. Fake subprocess checks without sockets may be run by the implementing agent.
- **Coordinator-run browser:** verify resuming, reconnecting/rebound permission, Stop and fallback in `en` and `zh-CN` at 1440/1024/768/390px (360px minimum), with light/dark at 1440/390px for styling changes. Follow `docs/agents/frontend.md`, save screenshots and record actual keyboard/focus behaviour. Coordinator reviews changed screens at 1440/390px in both languages.
- **Coordinator-run real agents/network:** use the maintainer's existing logins in disposable real Git projects. Explicitly prepare each source before the test; recovery uses zero registry downloads. For Claude Code and Codex, cover Installed and Bundled separately, recording current executable/adapter/lock identities, host/Node, revision, server PIDs, stint/session IDs, crash point, load/continuation trace, checkpoint and parsed handoff. Verify a waiting Ask-level permission across restart for each agent, including a reject case in which the denied operation does not occur. No credentials, global CLI/config changes or automatic login. Provider network, cache setup network, sockets, browser and real-agent availability are coordinator resources, never assumed passes.
- **Exit:** ticket 09 requires resolved 01–08 and a real Codex and a real Claude Code active stint killed mid-work, restarted and automatically reaching parsed handoffs under the same stint/session IDs without a new brief. Include a graceful-restart check, the permission cases, both source paths and a forced failed-resume checkpoint/new-stint demonstration. Fake tests or the 2026-10-17 probes cannot replace these runs. Record platform limits; no untested-platform claim. Only the coordinator/maintainer's accepted exit sets M10 shipped.

## Out of Scope

- Product code, actual decision-record approval, commits or implementation in this spec-writing task.
- Reattaching to old processes, a daemon/supervisor, cloud recovery, machines losing power or durable storage, migrating agent-native sessions between machines, or copying native transcripts/credentials.
- Automatically changing agents/sources, downloading or repairing cache entries at startup, widening permissions, retry loops, or automatic fresh-stint creation after failed resume.
- Resuming a terminal/explicitly stopped stint, changing the ordinary handoff/checkpoint ordering, weakening review/gate evidence or adding parallel stints to a work item.
- GitHub tracker work, Gemini CLI, promoting experimental Grok, publishing or going public (M11–M13).

## Further Notes

- M9 is shipped as of the maintainer's 2026-10-26 acceptance. Its historical probe evidence motivates M10; it is not the M10 exit.
- Ticket 01 records the narrow decision change; implementation tickets 02–08 each leave a runnable check at the existing seams. They are not permission to modify unrelated product flows.
- The plan's M10 bullets are clarified to reflect automatic warm-cache recovery and experimental Grok fallback. M13 release notes must include the Project setup fix (never replacing an existing tracker by default) and Fast first run: the maintainer held the 0.1.2 patch for v0.2.

## Comments

**Codex, 2026-10-26:** Spec and tickets filed from the current code and first-run evidence. M10 is active; no implementation, real crash test, decision approval or exit pass is claimed.

Filing checks: `pnpm --config.verify-deps-before-run=false format:check` passed (381 files); `pnpm --config.verify-deps-before-run=false lint` passed (333 licence headers, 382 Biome files; existing informational `biome.json:24` deprecation); `pnpm --config.verify-deps-before-run=false vitest run packages/core --configLoader native` passed (32 files, 967 tests), including repo-backed tracker and roadmap checks. Separate guards passed for matching first-run spec sections, ticket fields/statuses/dependency order, at most eight acceptance boxes per ticket, exact M10 roadmap format and whitespace. Only planning Markdown changed; no commit.
