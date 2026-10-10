# 06 — Stage-level stints

Status: ready-for-agent
Blocked by: 01

## What to build

Agents can work beyond Implement (spec user stories 24–25). Stints can start on any stage whose skill is defined (Clarify `/grill-with-docs`, Spec `/to-spec`, Tickets `/to-tickets`, Review `/code-review`, and Implement on tickets as today), with or without a ticket. The brief for a stage-level stint invokes the stage's skill, points at the spec (or says there's no spec yet) and the work item folder, and carries the last handoff and developer notes as usual. The drawer offers "Start stint" for the current stage when the stage has a skill. One active stint per work item still applies.

## Acceptance criteria

- [ ] Core tests: stage-level briefs for each skill stage. Stages without a skill (Ship, Do) can't start a stage-level stint.
- [ ] Server test: a stage-level stint starts on a work item in Spec, runs with the fake agent, checkpoints, and hands off like a ticket stint.
- [ ] Component tests: the stage "Start stint" action, and its disabled reasons.
- [ ] All checks pass.
