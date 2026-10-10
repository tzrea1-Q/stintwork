# 10 — A work item's files come from its worktree

Status: ready-for-agent
Blocked by: none

## What to build

Per ADR 0009: once a work item has a worktree, the board, the brief and "changed since" use that work item's `.scratch/<work-item>/` files from the worktree. Found by a real two-ticket test: Codex resolved ticket 01 in the worktree, but the board read the main checkout, so ticket 02 stayed blocked.

- The project index takes a work item's spec, tickets and `workflow.yaml` from its worktree when one exists, and from the main checkout otherwise. Other files (AGENTS.md, GLOSSARY.md, decision records, the roadmap) still come from the main checkout.
- The watcher also watches each work item's worktree copy, so ticket status changes made by an agent appear on the board live.
- "Changed since" compares the worktree's spec and ticket files against the last checkpoint commit.
- When the main checkout's copy of an active work item's files differs from the worktree's copy at the worktree's base commit (the developer edited it in the main checkout instead), show a warning naming the worktree path to edit.
- The drawer shows where an active work item's files live (its worktree path).

## Acceptance criteria

- [ ] Server test: after a fake-agent stint sets ticket 01 to `resolved` in the worktree, the snapshot shows 01 resolved and 02 unblocked, without anything changing in the main checkout.
- [ ] Server test: editing a ticket's Status in the worktree pushes a new snapshot over WebSocket within 1 second.
- [ ] Server test: editing the spec in the worktree after a stint lists it under "changed since" in the next brief preview.
- [ ] Server test: editing the spec in the main checkout while a worktree exists produces a divergence warning naming the worktree path.
- [ ] Core tests: index composition picks worktree files for active work items and main-checkout files for the rest.
- [ ] Component test: the drawer shows the worktree path for a work item with a worktree.
