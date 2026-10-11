# 06 — First stages write into the work item

Status: resolved
Blocked by: 04, 05

## What to build

The first stages produce their files where Stintwork reads them (spec user stories 21–32). Clarify, Spec, Tickets, Diagnose and Do briefs name the exact output location: "Write the spec to `.scratch/<slug>/spec.md`", "Write tickets to `.scratch/<slug>/issues/` as `NN-<slug>.md`, numbered from 01 in dependency order, each with `Status: ready-for-agent` and a `Blocked by:` line", and "Do not create another work item folder". Stage stints already run in the work item's worktree (ADR 0009), and their output is committed at the checkpoint. Output written to another folder leaves the gate not ready, and the gate view says where the stage's output was expected.

## Acceptance criteria

- [x] Server tests with the fake ACP agent: a Spec stint writing the spec and a Tickets stint writing tickets make their gates ready; output in a wrong folder leaves the gate not ready with the expected path.
- [x] Brief tests: each first-stage brief names its output path and forbids new folders.
- [x] Manual (coordinator): in a throwaway repo, a work item created from the board is taken through a real Spec stint and Tickets stint (Claude or Codex) to approved gates, recorded in Comments.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. verify.sh passed (1576 tests). Real-agent check on a throwaway Node project (tiny-notes): guided setup applied in one commit, and "Search notes" was created via the API with intent.

- **Clarify (Claude):** the first stint asked eight questions, answered with a developer note. Its plan showed a defect: every planning stage's brief said "If this stage produces a spec: write it to …", so Claude planned to write spec.md during Clarify. Fixed on main by the coordinator: only the spec-gate stage gets the spec line, only the tickets-gate stage the tickets line, and Clarify is told to record terms and decisions and leave the spec and tickets to later stages; brief tests updated. The second Clarify stint wrote only GLOSSARY.md, committed at the checkpoint and raised as a memory proposal. Accepting it let the Clarify gate be approved.
- **Spec (Claude):** wrote `.scratch/search-notes/spec.md` (no other folder), committed at the checkpoint; the gate became ready. Claude asked to confirm the test seam; the confirmation was given as a developer note and the gate approved.
- **Tickets (Codex):** wrote `.scratch/search-notes/issues/01-search-notes.md` with `Status: ready-for-agent` and `Blocked by: none`, committed at the checkpoint, no warnings; the gate became ready and was approved, moving the item to Implement.

Every step is one commit on `stintwork/search-notes`.
