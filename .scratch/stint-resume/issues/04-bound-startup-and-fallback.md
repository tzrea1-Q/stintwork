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
