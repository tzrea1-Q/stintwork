# 06 — M12 exit

Status: ready-for-human
Blocked by: 01, 02, 03, 04, 05

## What to build

The maintainer installs Antigravity CLI and signs in to it and Grok Build. The coordinator completes [agent-polish 04](../../agent-polish/issues/04-grok-end-to-end.md), including the Grok probe, and runs one real stint each with Grok Build and Antigravity CLI. Record the versions, results, parsed handoffs and checkpoints without credentials. Fix and reverify any failures before claiming the exit. The maintainer marks M12 shipped.

## Acceptance criteria

- [x] Maintainer action: both agents are installed and signed in; agents never sign in or read credentials.
- [ ] Coordinator action: agent-polish 04 is resolved and both real stints end in parsed handoffs, with evidence recorded here.
- [ ] Maintainer action: review the evidence and mark M12 shipped.

## Comments

**Coordinator, 2026-11-10: Antigravity real stint passed.**

- **Setup.** Fixture: local repo `/Users/tzrea1/Develop/stintwork-m12-exit` (no remote), work item `countdown`, quick workflow, Do stage. Served from main `30635ad`'s built `dist` (more-agents 02+03 merged), with Antigravity CLI 1.5.3 from Installed and the permission level Edit freely. The maintainer installed agy and signed in themselves; agents never signed in or read credentials.
- **Stint `ad8d39fe`.** It ran 03:14:08–03:19:35 UTC and ended `finished`, with checkpoint `5a777f6` and a parsed handoff:
  - *Stopped at:* `countdown(n)` implemented in `src/countdown.js`, spec criteria ticked, `npm test` passing (3 tests).
  - *Unresolved:* none.
  - *Next step:* review, commit, approve the gate.
- **Verification.** `npm test` in the worktree passes.
- **Permissions.** The in-worktree file write needed no request. Every shell command went to Needs you, because Antigravity sends the command as `rawInput.CommandLine`, which Stintwork's safe-command check does not read yet; the fix is in the ticket 04 run. The coordinator reviewed each request: read-only git, `ls` and `npm test` were allowed once, and `ls -la ..` (outside the worktree) was denied. The agent continued after the denial.
- **UI.** The brief preview's readiness card showed "Uses your installed Grok CLI and login." for Antigravity, without the Experimental label. The agent selector itself does label both agents "(Experimental)". Both are being fixed in the ticket 04 run.

**Still open.** Grok Build: four real stints were rate limited (see agent-polish 04). Criterion 2 waits on that.

**Coordinator, 2026-11-10: Antigravity confirmed on the final code.**

- **Setup.** Rebuilt from main `4a3fafd` (more-agents 04+05 merged), with the fixture server restarted. Work item `pad`, Antigravity CLI 1.5.3, permission level Edit freely.
- **Brief preview.** The readiness card now shows "Experimental" and "Uses your installed Antigravity CLI and login."; the selector lists "Antigravity CLI (Experimental)".
- **Stint `0dbaff46`.** It ran 03:58:51–04:01:50 UTC and ended `finished`, with checkpoint `dc39ea9` and a parsed handoff:
  - *Stopped at:* orientation done and the baseline `npm test` passing; implementation not started.
  - *Unresolved:* none.
  - *Next step:* create `src/pad.js` and its test, then run `npm test`.
- **Permissions.** The log records `automatic: true` on four safe in-worktree commands (`ls -la && ls -la .scratch/pad`, `ls -la src test`, `ls -la .stintwork`, `ls -la .stintwork/local`), so Antigravity's `CommandLine` is now understood. These went to Needs you as intended:
  - a compound `git status && …`;
  - `npm test`;
  - `git log -n 5`, because the safe policy accepts `-5` but not `-n 5`;
  - `git branch -a`.
  The coordinator allowed each of these once. It denied `git log stintwork/clamp`, which belongs to another work item's branch. After that denial the agent wrote its handoff and stopped, rather than continuing.

Antigravity's half of criterion 2 is met by stint `ad8d39fe` (implementation complete) and confirmed by `0dbaff46` on the merged code. Grok's half remains blocked by rate limiting (agent-polish 04).
