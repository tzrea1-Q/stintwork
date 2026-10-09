# Stintwork makes a checkpoint commit when a stint ends

When a stint ends, whether it finished, was stopped or failed, Stintwork commits the worktree's changes on the work item's branch as a checkpoint. It does this even if the agent didn't commit. In the 2026-10-09 handoff test, an interrupted stint left its work uncommitted, and the next stint's commit swept in part of it while leaving the rest dirty. The handoff then described a state that git didn't record. Checkpoints make every brief point at an exact commit, and they make stale evidence detectable (findings and checks are tied to a commit).

## Consequences

Work item branches contain checkpoint commits, which may be squashed when merging. Stintwork needs write access to the worktree's git metadata, and must grant it explicitly to agents whose sandboxes block it (Codex needs the git dir added as a writable root).
