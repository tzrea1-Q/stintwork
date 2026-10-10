# 12 — Superseded unresolved handoffs

Status: ready-for-agent
Blocked by: none

## What to build

Found while verifying ticket 04 on this repo. Needs you showed an "Unresolved handoff" from stint 2 of M2 ticket 11 ("checks unverified, ticket not updated"), although stint 3 later resumed from that handoff and finished the ticket. An unresolved handoff is answered by the next stint that starts from it: once a later stint on the same ticket (or, for stage-level stints, the same work item and stage) has started with that handoff in its brief, the earlier handoff's attention item should disappear. If the later stint also leaves items unresolved, it raises its own item.

## Acceptance criteria

- [ ] Core tests: a handoff-unresolved item is not derived when a later stint's started brief included that handoff. It is still derived when no later stint started from it.
- [ ] Server test: after a resume stint starts from an unresolved handoff, the item disappears over WebSocket.
- [ ] On this repo after restart, no stale handoff item remains for M2 ticket 11's stints.
- [ ] All checks pass.
