# 07 — Stale evidence and the Review gate

Status: resolved
Blocked by: 04, 05, 06

## What to build

The Review gate means what it says (spec user stories 23–27). `core` derives staleness: findings and checks are stale when their commit differs from the work item branch's head. The Review gate's readiness becomes:
- every finding resolved or accepted;
- every configured check passing on the head commit;
- no stale evidence;
- no open memory proposals.

The gate view lists each condition with its state and what to do about it. Approving moves the work item to Ship. Stale markers show the commit the evidence was about.

## Acceptance criteria

- [x] Core tests: staleness and readiness for each combination of missing conditions.
- [x] Server test: a new commit after checks and findings makes them stale and the gate not ready. Rerunning makes it ready.
- [x] Component tests: stale markers, and the condition list in the gate view.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex. A coordinator constraint was added to the brief: Stintwork's own bookkeeping commits (the work item's workflow.yaml and review.yaml) don't make evidence stale, otherwise recording a decision would instantly invalidate everything. Policy: the latest Review stint's findings are the current evidence; older stints' findings are history. verify.sh passed (1152 tests). Real check on adder in a throwaway repo, after the send-back fix stint: approving Implement moved it to Review. An early Review approval returned 409 with five conditions (review stint, findings, checks, freshness, memory), each with an action. A fresh real Codex review stint returned "No findings". Checks configured in .stintwork/config (node add.test.js) passed. Approve then succeeded and moved the item to Ship. After reopening the gate (a bookkeeping commit) and committing a change to add.js, approval was refused with freshness false. After git revert of that change, freshness was true again (staleness compares content, not commit ids). The gate view in the browser lists all five conditions with Ready/Blocked and the action. Follow-up nit: after a reopen, the review condition's text says "The stage stint must finish before approving." even though the previous stint finished; it should say a new Review stint is needed.
