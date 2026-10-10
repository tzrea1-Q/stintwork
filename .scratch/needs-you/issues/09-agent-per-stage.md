# 09 — Agent per stage

Status: ready-for-agent
Blocked by: 01

## What to build

The developer chooses which agent works each stage (spec user stories 27–28). The drawer's stage rail gets an agent picker per stage, prefilled from the workflow's default agent and listing registered agents. Unavailable agents are disabled with the reason. Choosing writes `stages.<stage>.agent` into `workflow.yaml`, with the same write rules as gate approvals (committed in the worktree when one exists). The brief preview defaults its agent picker to the stage's agent, and starting uses the chosen agent.

## Acceptance criteria

- [ ] Server tests: choosing an agent writes `workflow.yaml` correctly with and without a worktree. Starting uses the stage's agent by default. An unavailable agent is refused.
- [ ] Component tests: the stage agent picker, disabled agents with reasons, and the brief preview defaulting to the stage's agent.
- [ ] All checks pass.
