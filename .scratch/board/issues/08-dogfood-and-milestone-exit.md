# 08 — Dogfood check and M1 exit

Status: ready-for-agent
Blocked by: 07

## What to build

Prove M1's exit test on Stintwork itself and on a second repo, and fix what that turns up.

- Run `pnpm stintwork` in this repo. Walk acceptance criteria 1–10 in `.scratch/board/spec.md` and record the result of each under `## Comments` here, with evidence: the command run, what was seen, and the commit tested.
- Run it against a copy of a PagePilot-shaped repo (`.scratch/contract-package/` with a spec and 6 tickets). Confirm the inferred stage and progress.
- Fix any small defects found, in separate commits referencing this ticket. Larger ones become new tickets under `.scratch/board/issues/`.
- Update `.stintwork/roadmap.md`: set M1 to `shipped` only when all criteria pass.

## Acceptance checks

- Every acceptance criterion in the spec has a recorded pass, with evidence, in `## Comments`.
- CI is green on the final commit.

## Out of scope

New features beyond the spec.
