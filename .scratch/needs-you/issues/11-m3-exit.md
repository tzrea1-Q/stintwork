# 11 — M3 exit

Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12

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

## Comments

**2026-10-10 · M3 exit check by coordinator.**

1. **Probes.**
   - Claude Code (`@agentclientprotocol/claude-agent-acp` 0.88.0): basic, commands, permission (allow and reject), cancel (15 ms) and resume all pass.
   - Grok Build: **rate-limited by Grok's API** on the developer's account. Basic, commands, permission and resume errored "Rate limited"; cancel passed (73 ms). Grok's ask-mode permissions remain untested, because the developer's config is always-approve (now detected and warned about). A real Grok stint earlier finished its work but failed its handoff; the parser was fixed with a test built from Grok's exact reply. Every later Grok stint was refused "Rate limited". Tracked as `agent-polish` ticket 04.
2. **Real ticket (pass).** `.scratch/cli-help/issues/01` was built through Stintwork on its own repo:
   - Claude Code at Edit freely was stopped partway. Checkpoint `36b4922`, precise handoff, 18 permission requests all answered from the Needs-you queue (0 automatic).
   - The requirement was changed in the worktree (`--version` prints only the number).
   - Codex then finished from a brief carrying Claude's handoff and the changed spec. 8 permission requests answered from the queue; `2ca3ca5` plus checkpoint `4962752`.
   - The coordinator checked `--version` → `0.0.0`, `--help` → exit 0, an unknown option → stderr and exit 2. All checks pass on the merged `main` (658 tests).
3. **Gate (pass).** The Implement gate was approved from the Needs-you queue. `workflow.yaml` was committed in the worktree with by, at and commit, and the card moved to Review.

Found during the exit test, tracked in `.scratch/agent-polish/` (M4):
- Edit freely forwards every command, contradicting the settled "safe list".
- The test suite fails or stalls inside agent environments (`CLAUDE_CODE_EXECUTABLE`).
- Gate-approval commits reuse the setup commit message.
- Grok end-to-end evidence is still pending its rate limit.
