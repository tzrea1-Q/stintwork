# 10 — M4 exit

Status: ready-for-agent
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09

## What to build

Prove the brief's full acceptance scenario (§13) on a second real repo: a copy of PagePilot with its `contract-package` work item (spec and six tickets; Clarify and Spec already done). Through Stintwork with real agents:

1. Implement a ticket and stop it.
2. Resume with a different agent.
3. Change a requirement in the worktree.
4. Run a Codex review; resolve or accept the findings, or send them back and fix them.
5. Run the checks.
6. Decide on a memory proposal.
7. Approve the Review gate.
8. Merge locally (or open and merge a PR, if the developer provides a GitHub test repo).
9. See the work item shipped with its history.

Fix small defects in separate commits; larger ones become new tickets.

## Acceptance criteria

- [ ] Each step is recorded with evidence under `## Comments`.
- [ ] The shipped work item's history shows every stint, the findings and their decisions, the checks with their commits, and the merge.
- [ ] `.stintwork/roadmap.md`: M4 set to `shipped` only when every criterion passes.
