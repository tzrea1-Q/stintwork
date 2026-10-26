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
