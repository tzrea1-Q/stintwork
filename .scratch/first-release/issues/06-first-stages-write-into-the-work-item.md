# 06 — First stages write into the work item

Status: ready-for-agent
Blocked by: 04, 05

## What to build

The first stages produce their files where Stintwork reads them (spec user stories 21–32). Clarify, Spec, Tickets, Diagnose and Do briefs name the exact output location: "Write the spec to `.scratch/<slug>/spec.md`", "Write tickets to `.scratch/<slug>/issues/` as `NN-<slug>.md`, numbered from 01 in dependency order, each with `Status: ready-for-agent` and a `Blocked by:` line", and "Do not create another work item folder". Stage stints already run in the work item's worktree (ADR 0009), and their output is committed at the checkpoint. Output written to another folder leaves the gate not ready, and the gate view says where the stage's output was expected.

## Acceptance criteria

- [ ] Server tests with the fake ACP agent: a Spec stint writing the spec and a Tickets stint writing tickets make their gates ready; output in a wrong folder leaves the gate not ready with the expected path.
- [ ] Brief tests: each first-stage brief names its output path and forbids new folders.
- [ ] Manual (coordinator): in a throwaway repo, a work item created from the board is taken through a real Spec stint and Tickets stint (Claude or Codex) to approved gates, recorded in Comments.
- [ ] All checks pass.
