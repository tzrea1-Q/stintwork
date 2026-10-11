# 10 — M4 exit

Status: resolved
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

- [x] Each step is recorded with evidence under `## Comments`.
- [x] The shipped work item's history shows every stint, the findings and their decisions, the checks with their commits, and the merge.
- [ ] `.stintwork/roadmap.md`: M4 set to `shipped` only when every criterion passes.

## Comments

**Coordinator, 2026-10-10 to 2026-10-11:** Run on `/tmp/pp-m4`, a local clone of PagePilot (no remote) with the spike's `contract-package` work item (spec plus six tickets; PagePilot's contract package was still a two-line scaffold). Built CLI from Stintwork main, permission level Edit freely.

1. **Implement and stop:** Claude started ticket 01 and was stopped from Stintwork after 6 file edits. The stint ended `stopped` with checkpoint `d503ad9` and a handoff listing what remained (`src/validate.ts`, exports, `resolveJsonModule`). Two of Claude's commands were answered automatically by the safe command list; three reached the queue.
2. **Resume with a different agent:** Codex resumed ticket 01 from the brief without redoing Claude's work and resolved it (`fc90e16`). Tickets 02–06 then ran in dependency order: Codex on 02, 04, 06 and Claude on 03, 05, all finished and resolved. The coordinator reran PagePilot's checks in the worktree: 65 tests, typecheck, lint, format and build passed.
3. **Requirement change:** after stint 1, ticket 01 gained a 40-character cap on `app` in the worktree. The next brief listed the ticket under "Changed since the last handoff", and Codex implemented the cap (`maxLength: 40`) with the new test `caps the app identifier at 40 characters`.
4. **Codex review, decisions, send back:** three real Codex review stints. Review 1: a Spec/major finding (consumer mutation of exported scale arrays can weaken stricter-wins merging) was sent back, and a Standards/minor finding (missing zh-CN README note) was accepted with a reason. Claude's fix stint froze the scales and ranked with private copies. Review 2: a Spec/major finding (mutable public schema object) and a nit (ADR claim) were sent back and fixed by Claude. Review 3: one Standards/minor finding (type-check fixture emitted into dist) was accepted with a reason. Every decision was committed as `Record finding <id> as <status> for contract-package`.
5. **Checks:** run from the review overlay with the default commands (test, lint, typecheck, build, format:check). All passed on head `b6f585a`, recorded with that commit.
6. **Memory proposal:** a developer note (an answer to review 1's unresolved handoff) asked for the immutability decision as an ADR. Claude wrote `docs/adr/0012-frozen-scale-constants.md` and later amended it. Each change raised a memory proposal with its diff in Needs you, and both were accepted from the queue in the browser.
7. **Review gate:** approved once every condition held; the item moved to Ship.
8. **Merge locally:** "Merge work item contract-package" (`0c6ba5b`) plus a separate "Record merge of contract-package" commit with `merged: { at, commit }`. The worktree and the `stintwork/contract-package` branch were removed, main is clean, and PagePilot's 67 tests pass on main.
9. **Shipped with history:** the board shows "Shipped locally at 0c6ba5b". The snapshot keeps all 12 stints (7 implement, of which one was stopped; 2 fix stints; 3 reviews), 7 review decisions (findings: 2 accepted, 3 sent back; memory proposals: 2 accepted), and the five checks with commit `b6f585a`. No warnings.

Defect found and fixed in a separate commit (`868b1cb`): Codex marked a ticket `Status: complete`, which Stintwork didn't treat as resolved, so later tickets stayed blocked. Briefs now say to set `resolved`, and `complete`/`completed` also count as resolved.

Not done here: a real pull request. That needs a GitHub test repo from the developer, and it is review-and-ship 09's manual criterion. M4 therefore stays `active` in the roadmap until 09's manual check runs; agent-polish 04 (Grok end to end) is also still open.
