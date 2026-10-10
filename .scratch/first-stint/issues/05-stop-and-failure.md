# 05 — Stop and failure

Status: resolved
Blocked by: 04

## What to build

The developer can stop a running stint, and failures end cleanly (spec user stories 17–18, 37).

- A Stop action in the drawer cancels the stint over ACP. The stint ends `stopped` promptly, then gets its checkpoint and a handoff attempt.
- An agent crash or ACP error ends the stint `failed`, shows the error in the stream, and still checkpoints. If the session is unusable, there is no handoff.

## Acceptance criteria

- [ ] Server test: stopping a fake-agent stint mid-turn ends it `stopped` within 2 seconds, with a checkpoint and a handoff.
- [ ] Server test: a fake agent that crashes mid-stint ends the stint `failed` with the error recorded, and still produces a checkpoint.
- [ ] Component tests: the Stop button, the stopped state and the failed state with its error.

## Comments

**2026-10-10 · implemented by Codex, verified by coordinator.** All checks pass (260 tests, after merging the corrected dogfood test from main). Real Codex: Stop was pressed during a stint's read-only inspection. The stint ended `stopped`, with an accurate handoff ("interrupted before any results came back; no edits, commits, or test runs") and a checkpoint recording the unchanged HEAD. Stop to end took 6.4 s, almost all of it Codex answering the handoff request. Cancellation itself is immediate, and the fake-agent tests hold the 2-second bound for the stop itself.
