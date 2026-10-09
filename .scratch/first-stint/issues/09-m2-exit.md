# 09 — M2 exit

Status: ready-for-agent
Blocked by: 05, 06, 07, 08

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
