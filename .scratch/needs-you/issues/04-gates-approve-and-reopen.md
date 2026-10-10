# 04 — Gates: approve and reopen

Status: resolved
Blocked by: 03

## What to build

Stages move forward by the developer's approval (spec user stories 13, 17–23). `core` gains gate readiness:

- Implement (Fix, Do): every ticket resolved and no stint running.
- Clarify, Spec, Tickets: their stage stint finished with a handoff.
- Review: its stint finished.

Ready gates appear as `gate-ready` attention items. A gate view in the drawer (and the queue item) shows the evidence: tickets resolved, last checkpoint, last handoff, open warnings. Approve records `{ by, at, commit }` and sets the next stage in `workflow.yaml`: committed on the work item branch when a worktree exists (ADR 0009), written in the main checkout otherwise. An inferred stage gets its `workflow.yaml` on the first approval. Reopen moves the stage back and records it. Approval is refused while a stint is running. The card moves columns on the board.

## Acceptance criteria

- [ ] Core tests: readiness per stage kind.
- [ ] Server tests: approving writes `workflow.yaml` (in the worktree with a commit, and in the main checkout for a work item without a worktree) and advances the stage in the snapshot. Reopen reverses it. Approval while a stint is running is refused.
- [ ] Component tests: the gate view with evidence, approve, reopen, and the refusal message.
- [ ] In the browser: approving `first-stint`'s Implement gate on this repo moves its card to Review. Reopening moves it back.
- [ ] All checks pass.
