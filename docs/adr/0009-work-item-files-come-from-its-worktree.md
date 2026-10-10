# A work item's files come from its worktree once it has one

Once a work item has a worktree, Stintwork reads that work item's `.scratch/<work-item>/` files (spec, tickets, `workflow.yaml`) from the worktree, not the main checkout. That is where stints actually happen. In the first real two-ticket test, Codex resolved ticket 01 in the worktree, but the board read the main checkout, so ticket 02 stayed blocked and nothing the stint did was visible until merge. The developer edits an active work item's spec in its worktree. Stintwork shows the path, and warns when the main checkout's copy has diverged since the worktree was created. Everything reaches `main` when the branch merges.

## Considered options

- **Sync ticket changes back into the main checkout after each stint.** Rejected: Stintwork would write to the developer's main working tree, and the two copies could conflict.
- **Agents edit planning files in the main checkout and code in the worktree.** Rejected: every stint would touch two working trees, and its commits would split across branches.

## Consequences

The file index and watcher cover each work item's worktree as well as the main checkout. "Changed since" compares the worktree's files with the last checkpoint. Work items without a worktree are read from the main checkout, as before.
