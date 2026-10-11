# 04 — Gate output conditions

Status: ready-for-agent
Blocked by: 01

## What to build

Gates check that a stage left its output (spec user stories 23, 25, 27, 28, 22). The workflow's `gate` kind drives readiness. `manual` (Clarify, Diagnose, Do) is the developer's approval alone. `spec` also needs a `spec.md` that parses. `tickets` needs at least one ticket, no ticket warnings, and valid dependency order. `evidence` is M4's Review rule unchanged, and `merge` is Ship. Open memory proposals block the Clarify gate as they block Review. The gate view lists the output condition beside the others, with its state and what to do about it. The server refuses approval while the condition fails.

## Acceptance criteria

- [ ] Core tests: readiness for each gate kind with and without its output.
- [ ] Server tests: Spec and Tickets approvals refused without valid output and accepted with it; Clarify refused while a memory proposal is open.
- [ ] Component test: the gate view shows the output condition and its action.
- [ ] All checks pass.
