# 08 — Restart recovery and stint history

Status: ready-for-agent
Blocked by: 05

## What to build

History survives restarts and is never wrong (spec user stories 25–26, 33–34, 36).

- On server start, stints whose log has no end entry are marked `interrupted`, and their worktrees get a checkpoint.
- The drawer's stint history lists every stint of the work item, with agent, ticket, status, start and end times, and checkpoint commit. Opening one replays its full stream and handoff from the log.

## Acceptance criteria

- [ ] Server test: kill the server mid-stint, start it again, and the stint is `interrupted`, with a checkpoint of its uncommitted edits.
- [ ] Server test: history order and contents match the logs after a restart.
- [ ] Component tests: the history list, and replaying a past stint (stream plus handoff).
