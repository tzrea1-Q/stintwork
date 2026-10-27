# 09 — M10 exit

Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08

## What to build

The coordinator/maintainer records the M10 verdict after 01–08 resolve and the decision record is approved. Use ticket 08's runbook on the built/packed revision in disposable real Git projects with the maintainer's existing logins. These checks need real Claude Code/Codex, provider network, process signals, sockets and a browser; explicit initial cache preparation may also need registry network. Do not read credentials, sign in, upgrade global CLIs or change agent configuration.

For a real Codex stint and a real Claude Code stint, wait for observable mid-work edits/streaming, kill only the server, then restart it on the same project and local logs. Both must automatically load the same session in a new process, continue with no new brief and reach a parsed handoff and checkpoint under the original stint ID. A cleanly finished session recall, whole-process-group kill alone or a fresh brief-based stint does not pass this exit.

Exercise Installed and Bundled paths separately for each agent, recording exact current identities rather than assuming the 2026-10-17 versions remain installed. Repeat with a pending Ask-level permission for each agent, verify reconnecting then working answers, and include reject cases without denied side effects. Also check graceful restart, repeated restart, explicit Stop and a forced resume failure followed by checkpoint and a developer-started new stint from recorded state. Grok stays experimental/fallback and does not block M10.

Retain revision/build identity, OS/architecture/Node, agent/source/executable/version/adapter/lock, original and replacement process identity, stint/session IDs, crash point, recovery events, checkpoint/handoff results, screenshots and actual commands. Record failures and untested platforms. Set M10 shipped only after the accepted pass; otherwise leave it active with blockers. This ticket authorizes recording the exit, not publishing v0.2.

## Acceptance criteria

- [ ] Tickets 01–08 are resolved, the approved decision record is linked, and required automated/build/package/browser evidence or explicit limits are recorded.
- [ ] A real Codex and a real Claude Code mid-work server-only kill/restart each reaches a parsed handoff/checkpoint in the same stint/session with a new process, no new brief and no overlapping writer.
- [ ] Both agents' Installed and Bundled paths are exercised separately with current source/executable/adapter/lock identity and zero startup registry preparation/downloads.
- [ ] Each agent's waiting Ask permission returns to Needs you, becomes answerable only on a live callback, and allow/reject delivery is verified; rejection leaves the denied operation absent and stale answers fail safely.
- [ ] Graceful and repeated restart, explicit Stop and forced failed-resume checkpoint/new-stint recovery have actual outcomes, preserving work/history and exposing checkpoint errors honestly.
- [ ] English/Chinese browser evidence includes recovery/permission/fallback and the coordinator's 1440/390px review, with full required width/colour checks linked from 07.
- [ ] Comments record exact revision/environment/commands, IDs and artifacts, actual pass/fail and platform/resource limits; Grok is not promoted from old evidence.
- [ ] The maintainer's accepted verdict is recorded; only a full accepted pass sets M10 `shipped`, otherwise it remains `active` with concrete blockers.

## Comments

**Codex, 2026-10-26:** Filed ready-for-human. No M10 real crash/resume, permission-restoration or exit check has been run as part of this docs-only task; M10 remains active.

**Coordinator, 2026-10-26 — exit runs, Codex half (interim):**

- **Environment:** revision `f65d106` (main after tickets 01–08), built CLI, darwin-arm64, Node 22.22.3, the maintainer's existing Codex login. Runs used a disposable Git project. Bundled runs used `CLAUDE_CODE_EXECUTABLE=/nonexistent/claude CODEX_PATH=/nonexistent/codex` and a disposable `STINTWORK_AGENT_CACHE`.
- **Evidence:** per-run transcripts are in the coordinator scratch folder `m10-exit-evidence/`.
- **Every run below:** one `started` entry, so no new brief; a single ACP session ID; a new owner PID per restart; zero registry/npm traffic during recovery; no stopped or stray adapter processes afterwards.

Server-only SIGKILL and restart runs:

| Run | Source/version | Outcome |
|---|---|---|
| Server-only SIGKILL mid-work | Installed 0.163.0, adapter 2.1.1 | Owner 93069 → 4597; `suspended → resuming → resumed`; finished with a parsed handoff, checkpoint `1fb3a8e`. |
| Server-only SIGKILL mid-work | Bundled 0.159.3, adapter 2.1.1 | Owner 71137 → 10868; resumed; finished with a handoff, `5655ddf`. |
| Two successive SIGKILLs (second after `resumed`) | Installed | Three attempts (62989 → 74136 → 82089) in one session; one ending, finished with a handoff, `a2576fe`. |
| Graceful SIGTERM | Installed | `suspending → suspended → resuming → resumed`; finished with a handoff, `eac3fb9`. |
| Explicit Stop mid-work | Installed | 202; one `stopped` ending with a handoff, checkpoint `b58cc3f`. |
| Forced resume failure (cache entry moved away after the kill) | Bundled | `fallback`, `interrupted` with an explicit ENOENT error, checkpoint `75c1ade`. A developer-started new stint then based on `75c1ade`, with the brief citing that checkpoint; it finished with a handoff (`8c4e24d`). |

Pending Ask-level permission runs:

| Run | Outcome |
|---|---|
| Reject across SIGTERM | `reconnecting` with the original `raisedAt`; the reissue bound live as the same logical item. `cancel` returned 200; a duplicate returned 409. The denied `spec.md` rewrite is absent: checkpoint = scope commit `8b58fcd`. |
| Allow across SIGKILL | `reconnecting` first. Codex reissued with a **different** command, so the reissue was treated as a changed request needing fresh consent: new item, old one retired. `allow_once` returned 200; the command ran (`spec.md` +9/−1, `47b11ff`); a duplicate returned 409. |

**Follow-up (not blocking):** a Start sent immediately after the fallback ending returned no stint, while a retry seconds later succeeded. Probably the recovery reservation is released just after `ended`.

**Claude half: blocked.** The first Claude run ended at once with "Claude Code authentication required. Sign in with claude auth login". The maintainer must re-authenticate; the coordinator does not sign in. The Claude Installed/Bundled kill, graceful-restart and Ask allow/reject runs are pending. M10 remains active.

**Coordinator, 2026-10-26 — exit runs, Claude half and proposed verdict:**

- **Setup:** after the maintainer re-authenticated Claude Code, the same revision `f65d106`, harness and disposable project were used.
- **Every Claude run below:** one `started` entry (no new brief); one ACP session ID; a new owner PID per restart; zero registry/npm traffic during recovery; no stopped or stray processes afterwards.

| Run | Source/version | Outcome |
|---|---|---|
| Server-only SIGKILL mid-work | Installed 2.1.295, adapter 0.88.0 | Owner 79081 → 87511; `suspended → resuming → resumed`; finished with a parsed handoff, checkpoint `8bdecb9`. |
| Server-only SIGKILL mid-work | Bundled 2.1.293, adapter 0.88.0, first-use preparation into the disposable cache | Owner 24642 → 55564; resumed; finished with a handoff, `f45d38e`. |
| Graceful SIGTERM | Installed | `suspending → suspended → resuming → resumed`; finished with a handoff, `0b3e13e`. |
| Pending Ask, Reject across SIGTERM | Installed | `reconnecting` with the original `raisedAt`; the reissue bound live as the same logical item. `reject` returned 200; a duplicate returned 409. The denied `spec.md` write is absent: checkpoint = scope commit `5eadc86`. |
| Pending Ask, Allow across SIGTERM | Installed | Same logical item with the original `raisedAt`. `allow-once` returned 200; the write ran (`spec.md` +45/−1, `7a9a9a6`); a duplicate returned 409. |

**Acceptance criteria:**

- **Tickets and evidence:** 01–08 are resolved. ADR 0012 is approved. The automated, build, package and browser evidence is recorded in 05–08. The browser review at 1440/390px in en and zh-CN is linked from 07.
- **Mid-work crash:** a real Codex and a real Claude mid-work server-only kill each reached a parsed handoff and checkpoint, in the same stint and session, with a new process and no new brief. This holds for both Installed and Bundled.
- **Ask permissions:** each agent's waiting Ask permission returned to Needs you. It became answerable only on a live callback. Allow and reject were delivered, rejection left the denied operation absent, and stale or duplicate answers failed safely (409).
- **Restarts and failure paths:** graceful restart, repeated restart (two kills), explicit Stop, and forced failed-resume → checkpoint → new stint all completed with the expected outcomes. The checkpoint error was surfaced.

**Limits:**

- Only darwin-arm64 was exercised; Linux has CI unit/e2e coverage only, and Windows blocks suspension.
- Grok remains experimental (fallback only) and was not promoted.
- Repeated restart and Stop were run with Codex only.
- **Follow-ups:**
  - A Start sent immediately after a fallback ending briefly returned no stint.
  - Stint history shows the raw agent ID and English ISO timestamps (pre-existing).

**Proposed verdict:** pass. M10 stays `active` until the maintainer accepts.

**Coordinator, 2026-10-26:** The maintainer accepted the exit verdict (pass) on 2026-10-26, with the limits above. M10 is set to shipped. The follow-ups (Start right after a fallback ending; history raw agent ID and timestamps) are recorded for later work.

**Coordinator, 2026-10-27:** M10 reopened, at the maintainer's choice. Linux CI (`checks` on ubuntu-latest) has failed since the stint-resume 05 merge: 16 server-only SIGKILL cases. On Linux, `readlink /proc/<pid>/cwd` returns EACCES for non-dumpable or other-user processes, and that EACCES failed the whole writer scan. The result was that crash recovery was blocked on Linux. My verdict summary above wrongly said Linux had CI coverage. The fix is on `codex/m10-linux`. M10 returns to shipped once Linux CI is green.

**Coordinator, 2026-10-27:** Linux fix merged (`246d98f`, from `codex/m10-linux`). An unreadable `/proc/<pid>/cwd` (EACCES/EPERM) no longer fails the writer scan. Processes that started before the attempt are excluded before their cwd is read, and any other unreadable cwd stays bounded by the rescans. Evidence:
- Reproduced in a Linux container (node:22-bookworm-slim, aarch64, non-root user, with a non-dumpable same-user `ssh-agent`). On `main` the same 16 server-only SIGKILL cases failed; on the fix branch they passed.
- The full package suite passed in that container (103 files).
- macOS verify passed: format, lint, typecheck, build, 2,758 unit tests, package smoke, 334 e2e.
- A Codex review (gpt-6.1-terra) found no defects.
- GitHub CI run 40472116168 passed: checks, browser, and package-smoke on ubuntu-latest and macos-latest.

M10 is set back to shipped. Real-agent runs remain darwin-arm64 only.
