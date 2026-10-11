# 05 — Create a work item

Status: resolved
Blocked by: 01, 02

## What to build

A work item can be created from the board (spec user stories 10–20). Pressing `c`, or choosing "Create work item" in ⌘K, opens a dialog with a title, a workflow (from the loaded workflows), an optional milestone and optional intent. The server previews the slug: kebab-case ASCII, lower case, at most 48 characters, derived from the title. It refuses an existing or invalid slug. On confirmation it writes `.scratch/<slug>/workflow.yaml` with the workflow, the first stage and the intent, adds the slug to the chosen milestone (with ticket 02's serialiser), and commits both as "Create work item <slug>". It refuses while those paths have uncommitted changes. A feature folder with only a valid `workflow.yaml` is indexed as a work item with no spec and no tickets. Every stage's brief includes the intent as "What the developer asked for". The new card appears in the first stage without a reload.

## Acceptance criteria

- [x] Core tests: slug derivation and refusal cases; a workflow-only folder indexed as a work item in its first stage; the intent in briefs.
- [x] Server tests: preview, duplicate and dirty refusals, the files and single commit, and the roadmap entry.
- [x] Component tests: the dialog from `c` and ⌘K, the slug preview, the workflow choice and refusals.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. verify.sh passed (1467 tests). Browser check on a throwaway repo: `c` opened the dialog listing Feature, Bug, Quick and the repo's custom Lean workflow, and both milestones. Title "Export board to CSV!" previewed `.scratch/export-board-to-csv/`. Create made one commit, "Create work item export-board-to-csv" (workflow.yaml with title, workflow, stage clarify and intent, plus the roadmap entry under Next). The card appeared in Clarify without a reload, and the brief shows the intent under "What the developer asked for". Creating the same title again returned 409 "already exists".
