# 11 — M3 exit

Status: ready-for-agent
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10

## What to build

Prove M3's exit test with real agents.

- Rerun the ACP probe for Claude Code and Grok Build against the pinned adapters, and record the results. Grok's ask-mode permissions stay untested while the developer's config is always-approve; record that.
- On a real Stintwork ticket:
  1. Start it with Claude Code at Edit freely.
  2. Stop it.
  3. Change a requirement in the worktree.
  4. Finish it with Codex.

  Every permission prompt is answered from the Needs-you queue, with no hand-written context.
- Approve the Implement gate from the queue and see the card move to Review.
- Fix small defects in separate commits; larger ones become new tickets.

## Acceptance criteria

- [ ] Probe results for Claude Code and Grok Build recorded under `## Comments`.
- [ ] The real ticket is resolved through a stopped Claude stint and a finished Codex stint, each with a checkpoint and handoff. The Codex brief contains Claude's handoff and the requirement change. Every permission was answered from the queue. All checks pass.
- [ ] The Implement gate approval is recorded in `workflow.yaml`, and the card shows Review.
- [ ] `.stintwork/roadmap.md`: M3 set to `shipped` only when every criterion passes.
