# 08 — Dogfood check and M1 exit

Status: resolved
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

## Comments

**2026-10-09 · M1 exit check by coordinator, at commit c9b1d9d.**

1. Pass: `pnpm stintwork --no-open` prints `http://localhost:4317`, and `GET /api/project` returns the snapshot (checked in tickets 05–07).
2. Pass: the built CLI (`packages/cli/dist/bin.js`), run in a PagePilot-shaped git repo with `.scratch/contract-package/` (spec plus 6 tickets, 01–03 resolved), shows `contract-package` at Implement, inferred, 3/6, order 1–6, with 05 and 06 blocked. No warnings.
3. Pass: core tests for blockers and missing references (ticket 02); confirmed on the fixture above.
4. Pass: core tests for workflow.yaml overriding inference and falling back on invalid files (ticket 03).
5. Pass: web test `milestone filter hides other milestones` (ticket 06), and the ⌘K milestone filter in the browser (ticket 07).
6. Pass: in the browser, editing ticket 06's `Status:` line changed the card from 5/8 to 6/8 without a reload (ticket 06). Also covered by the server WebSocket test.
7. Pass: core test `a malformed ticket produces a warning without affecting other work items` (ticket 02).
8. Pass: run from `/tmp`, the CLI exits 1 with "Not inside a Git repository" (ticket 01).
9. Pass: on this repo, the board shows `board` in M1 with its tickets and correct progress (tickets 05–07).
10. **Partly:** `format:check`, `lint`, `typecheck`, `test` (115) and `build` all pass locally. `.github/workflows/ci.yml` exists, but the repo has no remote yet, so GitHub CI has not run.

No defects were found that needed new tickets. M1 stays `active` in the roadmap until criterion 10 runs in CI.

**Coordinator, 2026-10-11:** Criterion 10 now passes. The repository was pushed to the private GitHub repo `tzrea1-Q/stintwork`. The first CI run (38104187318) failed one server test because CI's git names new repositories `master`; that exposed a real defect (review diffs assumed `main`), fixed in `62ec2cd`. The run on that commit (38105201650) passed format:check, lint, typecheck, test and build. M1 is set to `shipped` in `.stintwork/roadmap.md`.
