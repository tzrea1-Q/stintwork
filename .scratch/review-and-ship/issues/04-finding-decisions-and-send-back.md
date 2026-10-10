# 04 — Finding decisions and send back

Status: ready-for-agent
Blocked by: 03

## What to build

Every finding ends with a decision (spec user stories 14–17). The developer resolves a finding, accepts it with a reason, or reopens it, from the overlay. Decisions are recorded in a review file in the work item folder (one entry per finding id, with status, reason, who and when), written like `workflow.yaml`: committed in the worktree. "Send back" takes the open findings, reopens the Implement stage (M3's reopen), and adds a "Review findings" section, marked as coming from review, to the next implement brief through the developer-note mechanism (M3 ticket 05).

## Acceptance criteria

- [ ] Server tests: decisions are written to and read from the review file (committed). Send back reopens Implement, and the next implement brief contains the open findings. Notes are consumed on start.
- [ ] Component tests: resolve, accept with a reason, reopen, and send back.
- [ ] All checks pass.
