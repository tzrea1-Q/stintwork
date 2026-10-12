# 14 — Quick and Bug first stages start without tickets

Status: resolved
Blocked by: 13

## What to build

Spec user story 32 promises that a Bug's Diagnose stage and a Quick task's Do stage work like the Feature's first stages, so every workflow can start from Stintwork. A real check on 2026-10-11 found otherwise: a Quick work item created from the board lands in Do, and starting a stint is refused with "This stage has no stint skill." Do has `skill: null` in the bundled Quick workflow and only ticket-scoped stints are allowed there, but a newly created Quick item has no tickets. The developer had to write a ticket by hand.

Make a work item's first stage startable right after creation, in every built-in workflow:
- Quick's Do stage runs a work-item-level stint from the intent when there are no tickets (for example with `/implement` against the intent, or no skill but a brief that says to make the change described by the intent). Choose and justify the approach. Keep ticket-scoped Do stints working when tickets exist.
- Check Bug's Diagnose (`/diagnosing-bugs`) the same way, from a freshly created Bug work item.
- The stint commits at the checkpoint, and Do's gate keeps its current rule.

## Acceptance criteria

- [x] Server tests: a freshly created Quick work item (and a Bug work item) can start its first stint with no tickets; ticket-scoped Do stints still work.
- [x] Brief tests for the no-ticket Do brief.
- [x] Manual (coordinator): create a Quick work item from the board in a throwaway repo and take it through Do with a real agent.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex in two rounds; verify.sh passed (1689 tests). Decision: Quick's Do stage declares `/implement`, reusing brief eligibility, intent, worktrees and checkpoints instead of special-casing stages without a skill. Bug's Diagnose already worked and now has tests.

The first real check found three more defects, all fixed with failing tests first:
- **Do gate:** Do could be approved with no stint and no tickets. Ticketless skill stages now need a finished stint of that stage.
- **Uncommitted change:** a gate approval without a worktree left an uncommitted `workflow.yaml` in the main checkout (`"commit": null`). Main-checkout workflow writes now commit, or restore on failure.
- **Agent startup:** the readiness wait was 15 s and failed three times at load 35–60. It is now one 60 s budget for all agents, with a busy-machine message.

Also fixed: the M2 stop-within-two-seconds assertions are now measured from the Stop request, with a documented 1 s load allowance (they passed 3/3 at load 25–35).

**Real check** on a fresh project at low load: a Quick work item created via the API; approving Do before any stint was refused ("The stage stint must finish before approving."); a real Codex Do stint started from the intent alone, with no ticket, added `multiply` and a passing node:test test, and the checkpoint committed it; the main checkout stayed clean; approving Do afterwards committed and moved the item to Review.
