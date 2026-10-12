# 14 — Quick and Bug first stages start without tickets

Status: ready-for-agent
Blocked by: 13

## What to build

Spec user story 32 promises that a Bug's Diagnose stage and a Quick task's Do stage work like the Feature's first stages, so every workflow can start from Stintwork. A real check on 2026-10-11 found otherwise: a Quick work item created from the board lands in Do, and starting a stint is refused with "This stage has no stint skill." Do has `skill: null` in the bundled Quick workflow and only ticket-scoped stints are allowed there, but a newly created Quick item has no tickets. The developer had to write a ticket by hand.

Make a work item's first stage startable right after creation, in every built-in workflow:
- Quick's Do stage runs a work-item-level stint from the intent when there are no tickets (for example with `/implement` against the intent, or no skill but a brief that says to make the change described by the intent). Choose and justify the approach. Keep ticket-scoped Do stints working when tickets exist.
- Check Bug's Diagnose (`/diagnosing-bugs`) the same way, from a freshly created Bug work item.
- The stint commits at the checkpoint, and Do's gate keeps its current rule.

## Acceptance criteria

- [ ] Server tests: a freshly created Quick work item (and a Bug work item) can start its first stint with no tickets; ticket-scoped Do stints still work.
- [ ] Brief tests for the no-ticket Do brief.
- [ ] Manual (coordinator): create a Quick work item from the board in a throwaway repo and take it through Do with a real agent.
- [ ] All checks pass.
