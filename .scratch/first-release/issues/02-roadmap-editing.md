# 02 — Roadmap editing

Status: resolved
Blocked by: none

## What to build

Milestones are edited from the board instead of by hand (spec user stories 55–61). Add a roadmap serialiser that rewrites only the fields Stintwork owns: heading, `Id`, `Status`, `Target` and the work-item list. It keeps every other line in each milestone section and any text before the first milestone. Server actions add, rename, reorder and update milestones (status, target) and move a work item between milestones. Each change is one commit with its own message ("Update roadmap: <what>"), refused while the roadmap has uncommitted changes. Milestone ids are derived once at creation and never change on rename. The board's milestone controls expose these actions.

## Acceptance criteria

- [x] Core tests: parse, edit, serialise round trips that keep hand-written lines and the preamble.
- [x] Server tests: each action's file content and commit, and the refusal on a dirty roadmap.
- [x] Component tests: adding, renaming, reordering, status and target edits, and moving a work item.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex in two rounds. verify.sh passed (1381 tests after merging main with ticket 01). Throwaway-repo check: in the browser's Edit roadmap dialog, adding "Next" and moving beta into it made two "Update roadmap: …" commits and kept the hand-written "Notes kept by hand." line. Round 2 fixed the new section's spacing (one blank line before the heading and before the list). Rechecked via the API: add, move, and a rename of "Now" to "Current" (id stays `now`) made three commits with the expected file. Decision accepted: a work item whose workflow.yaml declares a milestone keeps it, and a conflicting move is refused with 409 telling the developer to remove the declaration.
