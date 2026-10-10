# 04 — Finding decisions and send back

Status: resolved
Blocked by: 03

## What to build

Every finding ends with a decision (spec user stories 14–17). The developer resolves a finding, accepts it with a reason, or reopens it, from the overlay. Decisions are recorded in a review file in the work item folder (one entry per finding id, with status, reason, who and when), written like `workflow.yaml`: committed in the worktree. "Send back" takes the open findings, reopens the Implement stage (M3's reopen), and adds a "Review findings" section, marked as coming from review, to the next implement brief through the developer-note mechanism (M3 ticket 05).

## Acceptance criteria

- [x] Server tests: decisions are written to and read from the review file (committed). Send back reopens Implement, and the next implement brief contains the open findings. Notes are consumed on start.
- [x] Component tests: resolve, accept with a reason, reopen, and send back.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex in two rounds. verify.sh passed (1078 tests). Real loop in a throwaway repo on the adder work item, whose two findings came from a real Codex review. In the overlay I accepted the minor finding with a reason, which committed "Record finding <id>:2 as accepted for adder" with by/at/reason in review.yaml. Send back first refused, because the item had reached Review by inference with no Implement approval. Round 2 fixed it: Send back now moves the stage to Implement and records reopened (source: review) without inventing an approval, in one commit ("Record finding <id>:1 as sent-back for adder"). The next brief carried a "Review findings" section, marked as from review, with only the open finding. A real Codex Implement stint from that brief fixed add.js (a + b), replaced the type-only test with the two acceptance assertions, and committed 73ce09f. The note was consumed: the following brief preview no longer contains it.
