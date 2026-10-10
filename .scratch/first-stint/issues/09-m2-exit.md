# 09 — M2 exit

Status: resolved
Blocked by: 05, 06, 07, 08, 10

## What to build

Prove M2's exit test with the real agent.

- Run the ACP probe (`spikes/acp-probe`) against the pinned Codex adapter, and record the results.
- Through Stintwork with real Codex, implement one real Stintwork ticket: start the stint, stop it partway, then resume it from the brief in a new stint until it's done.
- Fix small defects in separate commits referencing this ticket. Larger ones become new tickets.

## Acceptance criteria

- [ ] The probe passes basic, commands, cancel and resume for the pinned Codex adapter. Results are recorded under `## Comments`.
- [ ] The real ticket is resolved through two Stintwork stints (stopped, then finished), each with a checkpoint and a handoff. The second brief contains the first handoff, and all checks pass.
- [ ] The stint history shows both stints correctly after a server restart.
- [ ] `.stintwork/roadmap.md`: M2 set to `shipped` only when every criterion above passes.

## Comments

**2026-10-10 · M2 exit check by coordinator.**

1. **Probe (pass).** `spikes/acp-probe` against the pinned `@agentclientprotocol/codex-acp` 2.1.1: basic, commands, cancel (8 ms) and resume pass. The permission scenario reports no request in Codex's default "Workspace access" mode, which is known behaviour (ticket 06).
2. **Real ticket through Stintwork (pass).** Ticket 11 was implemented with real Codex by Stintwork running on its own repo:
   - Stint 1 was stopped mid-edit. It got checkpoint `291bd6f` but **no handoff**. That exposed a defect (the handoff request failed right after the cancel and was silently dropped), fixed as ticket 12.
   - Stint 2 resumed from the checkpoint and was stopped mid-edit. Checkpoint `b552f53`, plus a precise handoff naming the uncommitted edits and the remaining failing test.
   - Stint 3 resumed from that handoff and finished (`end_turn`, checkpoint `c23ea44`). The ticket is resolved and all checks pass on the merged `main` (338 tests).
3. **History after restart (pass).** All three stints are listed with status, checkpoint and handoff, and past stints replay their full streams.

Also found during the exit test:
- A ticket's first brief didn't inherit the work item's last handoff, contrary to the spec. Fixed in `5d81634`.
- Stint 3 waited 15 minutes on a permission request. The coordinator's watch script failed to answer it, and a manual answer through the same endpoint worked first time; a server-side cause isn't ruled out. Waiting silently for approval is exactly what M3's Needs-you queue addresses.
- Adding a ticket to a work item that has an active worktree is awkward. The main checkout copy diverges, and Stintwork correctly warns, per ADR 0009. A "new ticket" action that writes into the worktree belongs in a later milestone.
