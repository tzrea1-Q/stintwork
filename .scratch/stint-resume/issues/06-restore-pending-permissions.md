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
