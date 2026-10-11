# 02 — Roadmap editing

Status: ready-for-agent
Blocked by: none

## What to build

Milestones are edited from the board instead of by hand (spec user stories 55–61). Add a roadmap serialiser that rewrites only the fields Stintwork owns: heading, `Id`, `Status`, `Target` and the work-item list. It keeps every other line in each milestone section and any text before the first milestone. Server actions add, rename, reorder and update milestones (status, target) and move a work item between milestones. Each change is one commit with its own message ("Update roadmap: <what>"), refused while the roadmap has uncommitted changes. Milestone ids are derived once at creation and never change on rename. The board's milestone controls expose these actions.

## Acceptance criteria

- [ ] Core tests: parse, edit, serialise round trips that keep hand-written lines and the preamble.
- [ ] Server tests: each action's file content and commit, and the refusal on a dirty roadmap.
- [ ] Component tests: adding, renaming, reordering, status and target edits, and moving a work item.
- [ ] All checks pass.
