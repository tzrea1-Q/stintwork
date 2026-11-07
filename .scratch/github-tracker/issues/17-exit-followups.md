# 17 — Real-repository exit follow-ups

Status: ready-for-agent
Blocked by: 16

## What to build

Resolve the findings from the real-repository exit, including the issues deferred from tickets 14 and 16. Preserve GitHub identity and evidence safeguards while keeping the board and recovery usable.

## Acceptance criteria

- [ ] Re-verify the GitHub account before its 60-second TTL expires so the board does not periodically blank to “Verifying GitHub account…”, hiding pending permissions and making UI refs stale.
- [ ] Diagnose and fix stint starts that fail silently or with “This operation was aborted” during adapter preparation, including the suspected link to the 60-second account re-check; preparation failures are never lost silently. This occurred twice on ticket #2 under low machine load.
- [ ] Starting another stint with the same pinned adapter does not repeatedly ask the developer to confirm its source.
- [ ] GitHub blockers display issue numbers in GitHub format, such as “#2” rather than “02”.
- [ ] Improve GitHub detail read latency for two tickets, observed at about 10–18 seconds.
- [ ] Pending permission requests have a stronger signal so they do not go unnoticed, as one did for 25 minutes.
- [ ] A handoff-unresolved attention item leaves Needs you when the gate it asks about is approved.
- [ ] While a post-stint write is active, the gate does not misleadingly show “Ready to approve”; attempted gate changes surface the `gate.activeWrite` reason instead of only “Could not change the gate.”
- [ ] “Changed since the last handoff” reports committed memory proposals and gate approvals instead of saying none.
- [ ] Startup does not serially block ordinary API requests on each pending recovery's GitHub detail fetch in `packages/server/src/index.ts`; several interrupted GitHub stints and slow GitHub must not delay ordinary requests by minutes. This was deferred from ticket 14.
- [ ] With dependency-only incomplete detail at a stage whose evidence includes tickets, Reopen remains available in `GateView` when the reopen route permits it, despite the projection suppressing `reviewDigest`. This was deferred from ticket 16.

## Comments

**Codex, 2026-11-07:** Collected the real-repository exit findings and the follow-ups deferred from tickets 14 and 16. This ticket does not block ticket 08.
