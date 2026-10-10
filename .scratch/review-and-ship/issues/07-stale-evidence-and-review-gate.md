# 07 — Stale evidence and the Review gate

Status: ready-for-agent
Blocked by: 04, 05, 06

## What to build

The Review gate means what it says (spec user stories 23–27). `core` derives staleness: findings and checks are stale when their commit differs from the work item branch's head. The Review gate's readiness becomes:
- every finding resolved or accepted;
- every configured check passing on the head commit;
- no stale evidence;
- no open memory proposals.

The gate view lists each condition with its state and what to do about it. Approving moves the work item to Ship. Stale markers show the commit the evidence was about.

## Acceptance criteria

- [ ] Core tests: staleness and readiness for each combination of missing conditions.
- [ ] Server test: a new commit after checks and findings makes them stale and the gate not ready. Rerunning makes it ready.
- [ ] Component tests: stale markers, and the condition list in the gate view.
- [ ] All checks pass.
