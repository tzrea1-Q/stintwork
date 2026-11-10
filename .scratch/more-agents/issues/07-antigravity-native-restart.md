# 07 — Antigravity native restart

Status: ready-for-agent
Blocked by: 01, 02, 03

## What to build

Outside the M12 exit, extend the M10 process ownership marker and recorded launch identity to native installed executables. Recover Antigravity in a new process with `session/resume`, without replaying the brief or stage skill. Preserve the ownership and permission safeguards; if recovery is unsupported or fails, stop verified writers and use the interrupted checkpoint fallback so the developer can start a new stint. Escalate teardown to SIGKILL when SIGTERM is ignored.

Ticket 01 records the live Antigravity CLI 1.5.3 probe: `session/resume` in a fresh process recalled the session without replaying history; `session/load` replayed two message updates. Every `agy acp` process ignored SIGTERM and required SIGKILL. Use that evidence without assuming other versions behave identically.

## Acceptance criteria

- [ ] Native executable ownership and launch records support safe new-process recovery and cleanup.
- [ ] Fake-agent tests prove resume without replaying the brief, permission safety, fallback on unsupported or failed recovery, and SIGKILL escalation.
- [ ] Record live verification and update documentation to match observed behavior.

## Comments

None yet.
