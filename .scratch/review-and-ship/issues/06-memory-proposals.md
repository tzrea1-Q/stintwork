# 06 — Memory proposals

Status: resolved
Blocked by: none

## What to build

Project memory changes only by the developer's decision (spec user stories 28–31). After each stint, changes on the work item branch between the stint's base commit and its checkpoint to project-memory paths (`GLOSSARY.md`, `docs/adr/**`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/**`) become `memory-proposal` attention items, one per changed file and stint, with the diff. Accept records the decision in the work item's review file. Reject reverts that file on the branch to its version at the stint's base, with a commit naming the proposal. Open proposals are exposed in the snapshot so Ship can block on them (ticket 08).

## Acceptance criteria

- [ ] Core tests: deriving proposals from changed paths, ignoring non-memory paths, one item per file and stint.
- [ ] Server tests with the fake agent: a stint that edits the glossary produces a proposal. Accept keeps the change and records the decision. Reject creates a revert commit and removes the item. Both survive a restart.
- [ ] Component tests: proposal items in the Needs-you queue with their diff, accept, and reject.
- [ ] All checks pass.
