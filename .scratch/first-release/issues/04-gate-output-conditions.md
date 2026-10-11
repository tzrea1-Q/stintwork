# 04 — Gate output conditions

Status: resolved
Blocked by: 01

## What to build

Gates check that a stage left its output (spec user stories 23, 25, 27, 28, 22). The workflow's `gate` kind drives readiness. `manual` (Clarify, Diagnose, Do) is the developer's approval alone. `spec` also needs a `spec.md` that parses. `tickets` needs at least one ticket, no ticket warnings, and valid dependency order. `evidence` is M4's Review rule unchanged, and `merge` is Ship. Open memory proposals block the Clarify gate as they block Review. The gate view lists the output condition beside the others, with its state and what to do about it. The server refuses approval while the condition fails.

## Acceptance criteria

- [x] Core tests: readiness for each gate kind with and without its output.
- [x] Server tests: Spec and Tickets approvals refused without valid output and accepted with it; Clarify refused while a memory proposal is open.
- [x] Component test: the gate view shows the output condition and its action.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. verify.sh passed (1447 tests). Throwaway-repo API check: Clarify lists "Developer approval; no file output required" plus "No open memory proposals"; Spec lists "spec.md exists and parses" with the action naming the work item's exact spec path. Approvals there also needed a finished stint (M3 rule), so the refusal paths rest on the fake-agent server tests; ticket 06 checks them with real agents.
