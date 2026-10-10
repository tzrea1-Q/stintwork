# M4 · Review and ship

Status: ready-for-agent

Milestone: M4 · Review and ship. See `docs/plan.md`, `GLOSSARY.md` (Stage, Gate, Checkpoint, Memory proposal, Project memory, Shipped), ADRs 0001, 0004, 0005 and 0009, and the M3 exit findings in `.scratch/needs-you/issues/11-m3-exit.md`. The early-M4 polish tickets live separately in `.scratch/agent-polish/`.

## Problem Statement

After M3, agents can take a work item from Clarify to a resolved Implement stage, and the developer approves stages from Needs you. The last mile is still manual. To review what an agent built, the developer reads diffs in a terminal and the reviewer's findings in a chat transcript. Nothing ties a finding to a line of code or to the commit it was about. Checks are whatever the last agent claimed to have run. Merging means leaving Stintwork: `git merge`, removing the worktree by hand, and remembering to clean up the branch (exactly what the coordinator did at every milestone exit so far). Agents also change project memory (glossary entries, decision records, AGENTS.md) inside their stints, and those changes reach `main` without anyone deciding they should.

## Solution

**Review.** On a work item in its Review stage, the developer starts a review stint (`/code-review`, Codex by default). Afterwards, Stintwork asks the agent for its **findings** in a fixed format, just as it asks for a handoff. Each finding has an axis (Standards or Spec), a severity, a file and line, a title and a body, and is tied to the commit the review looked at. A **review overlay** shows the work item's diff against `main`, with findings pinned under their lines and a findings list beside it. The developer resolves, accepts, or sends findings back.

**Checks.** Stintwork runs the project's **checks** (commands from `.stintwork/config`, defaulting to the project's test, lint, typecheck and build scripts) in the work item's worktree, against a specific commit, and records each result with that commit. When the work item has an open pull request, its CI checks from GitHub appear beside them. Findings and checks for an older commit are marked **stale**.

**Gates with evidence.** The Review gate becomes ready only when every finding is resolved or accepted, the checks pass on the branch's current commit, and nothing is stale. The developer still approves it.

**Memory proposals.** When a stint changes project memory files in the worktree (glossary, decision records, AGENTS.md), each change appears in Needs you as a **memory proposal** with its diff. Accept keeps it; reject reverts it on the work item branch with a commit. Unanswered proposals block shipping.

**Ship.** From the Ship stage, the developer either opens a pull request (push the branch and `gh pr create`, when the repo has a GitHub remote) and merges it when CI passes, or merges locally into the main branch. Both paths record the merge, remove the worktree and branch, and mark the work item **shipped**.

## User Stories

### Review stint and findings

1. As a developer, I want to start a review stint on a work item in its Review stage, so that an agent reviews the change before it ships.
2. As a developer, I want the review stint's brief to point at the spec, the tickets, the diff range and the review skill, so that the reviewer checks the change against what was asked.
3. As a developer, I want Codex as the default review agent and any agent selectable, so that a different model reviews what one model built.
4. As a developer, I want Stintwork to ask the reviewer for findings in a fixed format after its turn, so that findings become data rather than chat.
5. As a developer, I want every finding to carry its axis (Standards or Spec), severity, file, line, title and explanation, so that I can triage them.
6. As a developer, I want findings tied to the commit the review looked at, so that I know whether they still apply.
7. As a developer, I want a review that reports no findings to say so explicitly, so that "nothing found" isn't confused with "the review failed".
8. As a developer, I want a review whose findings can't be parsed to show the reason and the agent's raw reply, so that a format slip isn't silent.
9. As a developer, I want to run another review after changes, so that new commits get fresh findings.

### Review overlay

10. As a developer, I want a review overlay showing the work item branch's diff against the main branch, file by file, so that I can read the change in Stintwork.
11. As a developer, I want each finding pinned under the line it refers to, so that I read the comment next to the code.
12. As a developer, I want findings whose line isn't in the diff shown at the top of their file, so that none disappear.
13. As a developer, I want a findings list beside the diff, filterable by axis, severity and status, so that I can work through them.
14. As a developer, I want to resolve a finding (fixed), accept it (won't fix, with a reason), or reopen it, so that each one ends with a decision.
15. As a developer, I want to send open findings back to Implement as a note in the next implement brief, so that the next agent fixes exactly what the review found.
16. As a developer, I want sending back to reopen the Implement stage, so that the board reflects that work resumed.
17. As a developer, I want finding decisions recorded in the repo (alongside the work item), so that the review's outcome is part of the project record.

### Checks and stale evidence

18. As a developer, I want to run the project's checks against the branch's current commit from the review overlay, so that I have evidence instead of an agent's claim.
19. As a developer, I want the check commands configurable in `.stintwork/config`, defaulting to the project's test, lint, typecheck and build scripts, so that Stintwork fits any repo.
20. As a developer, I want each check's status, duration and output recorded with its commit, so that I can see what passed when.
21. As a developer, I want checks to stream their output live and be cancellable, so that long checks don't block me.
22. As a developer, I want a pull request's CI checks from GitHub shown beside local checks when one exists, so that I see both.
23. As a developer, I want findings and checks for an older commit marked stale, with the commit they were about, so that I never merge on outdated evidence.
24. As a developer, I want stale evidence to block the Review gate, so that the gate means what it says.

### Gates

25. As a developer, I want the Review gate ready only when all findings are resolved or accepted, the checks pass on the current commit, and nothing is stale, so that approval rests on evidence.
26. As a developer, I want the gate view to show exactly which condition is missing, so that I know what to do next.
27. As a developer, I want approving the Review gate to move the work item to Ship, so that shipping is the next step.

### Memory proposals

28. As a developer, I want changes a stint makes to the glossary, decision records or AGENTS.md shown as memory proposals in Needs you, so that project memory changes only by my decision.
29. As a developer, I want each memory proposal to show its diff and which stint made it, so that I can judge it.
30. As a developer, I want to accept a proposal (keep it) or reject it (revert it on the branch with a commit), so that the branch carries only memory I agreed to.
31. As a developer, I want unanswered memory proposals to block shipping, so that nothing slips into `main` unreviewed.

### Ship

32. As a developer, I want to open a pull request from the Ship stage when the repo has a GitHub remote, so that the change goes through my normal review and CI.
33. As a developer, I want Stintwork to ask before pushing the branch, showing the remote and branch, so that publishing is always my decision.
34. As a developer, I want the pull request's body generated from the spec, tickets, review outcome and checks, so that reviewers get context.
35. As a developer, I want to merge the pull request from Stintwork when its checks pass, so that I don't have to switch to GitHub.
36. As a developer, I want to merge locally into the main branch when there's no remote, so that local-only projects can ship too.
37. As a developer, I want merging to remove the work item's worktree and branch and mark it shipped, so that I never clean up by hand again.
38. As a developer, I want merge conflicts with the main branch reported clearly before merging, so that I can send the work item back instead of breaking `main`.
39. As a developer, I want a shipped work item to keep its stint history, review findings and checks, so that I can see how it got there.

### Exit

40. As a developer, I want the brief's full acceptance scenario to pass on a second real repo, so that M4 proves Stintwork works beyond its own repo.

## Implementation Decisions

- **Findings follow the handoff pattern.** After a review stint's turn, the agents package sends a findings request in the same session, with a timeout. It asks for a fixed Markdown format: one block per finding with axis, severity, path, line, title and body, or an explicit "No findings". The parser is lenient about preambles, as the handoff parser now is. The parsed findings, or a parse failure with the raw reply, are recorded in the stint log with the reviewed commit (the review stint's base commit). The format is defined once in `agents` and documented for the review skill.
- **Finding decisions live in the repo.** Finding status (open, resolved, accepted with reason, sent back) is recorded in a review file in the work item folder (for example `review.md` with one entry per finding id), written like `workflow.yaml`: committed in the worktree. This keeps the outcome in the project record (ADR 0001).
- **The diff comes from git.** `git` gains a work-item diff: the merge base of the work item branch and the main branch, to the branch head, as structured files and hunks with old and new line numbers. Binary files and renames are represented without content.
- **Checks are configurable commands.** `.stintwork/config` gains a `checks:` list of named commands. When it's absent, the defaults are the root `package.json` scripts named test, lint, typecheck, build and format:check, in that order. A check run executes in the worktree at its current commit, streams output over WebSocket, is cancellable, and appends a result record to a check log under `.stintwork/local/checks/`. When a pull request exists, `gh pr checks` results are fetched on demand and on a slow refresh, and recorded with the PR's head commit.
- **Staleness is derived.** Findings and checks are stale when their commit differs from the work item branch's current head. `core` derives staleness and the Review gate's readiness from the snapshot: findings, decisions, checks, branch head, open memory proposals.
- **Sending back** reopens the Implement stage (M3's reopen), and adds the open findings as a "Review findings" section to the next implement brief, through the developer-note mechanism from M3 ticket 05, marked as coming from review.
- **Memory proposals are derived from diffs, not a new format.** After each stint, changes on the work item branch since its base to project-memory paths (`GLOSSARY.md`, `docs/adr/**`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/**`) become memory-proposal attention items, one per changed file and stint. Accept records acceptance in the review file. Reject reverts that file on the branch to its base version with a commit naming the proposal. Open proposals block the Ship actions.
- **Ship uses `gh` through the developer's own login (ADR 0003).**
  - "Open pull request" checks for a GitHub remote, then shows a confirmation with the remote, branch and generated title and body. Only after confirmation does it push (`git push -u`) and run `gh pr create`.
  - "Merge pull request" runs `gh pr merge` with the repository's default method, once the PR's checks pass and the gate is approved.
  - "Merge locally" fast-forwards or makes a merge commit on the main branch in the main checkout. It refuses if the main checkout has uncommitted changes to files the merge touches.

  Every successful merge removes the worktree and branch (with the M2 per-repo lock), records `merged: { at, commit, pr? }` in `workflow.yaml` on the main branch, and moves the work item to shipped. Conflicts are detected before merging with a dry-run merge and reported, offering send back.
- **Gates.** The Review gate's readiness rule replaces M3's "review stint finished": all findings decided, checks passing on the head commit, no stale evidence, no open memory proposals. The Ship stage's gate is the merge itself.
- **Web.**
  - The review overlay (near full screen, per prototype variant B's review view): file list, diff with pinned findings, findings rail with filters, checks panel with commit and stale markers, and actions (run checks, start review, send back).
  - Memory proposals in the Needs-you queue with their diff.
  - Ship actions in the drawer for the Ship stage, with the push confirmation.

## Testing Decisions

- **Good tests check external behaviour:** API responses, WebSocket frames, files, commits and branches in temporary repos, rendered UI. Tests reading this repo's own `.scratch/` assert only durable properties (AGENTS.md).
- **Main seam: the server against the scriptable fake ACP agent, plus a scriptable fake `gh` placed first on PATH,** as ticket 07 did for the pnpm installer. The fake `gh` records its invocations and returns scripted output for `pr create`, `pr checks`, `pr merge` and `repo view`. Server tests cover:
  - review stints producing findings, "no findings", and parse failures;
  - finding decisions written to the review file;
  - send back reopening Implement and putting findings in the next brief;
  - checks running in the worktree with results tied to commits and staleness after a new commit;
  - memory proposals derived, accepted and rejected (revert commit);
  - the gate readiness rule;
  - opening a pull request only after confirmation, merging through the fake `gh`, and merging locally;
  - worktree and branch removal and shipped state;
  - conflict detection.

  Real GitHub is exercised manually only, on a repository the developer chooses.
- **Core unit tests:** finding parsing, staleness, Review gate readiness, memory-proposal derivation from changed paths, PR body generation.
- **Git package tests:** the work-item diff (hunks, line numbers, renames, binary files), dry-run conflict detection, local merge and cleanup.
- **Web component tests:** the review overlay (pinned findings, out-of-diff findings, filters, decisions), the checks panel with stale markers, memory proposals in the queue, Ship actions with the push confirmation.
- **Prior art:** the M2 and M3 server suites (stints, checkpoint-handoff, worktree-readiness, gates, handoff answers), the M1 board and drawer component tests, the git worktree tests.

## Out of Scope

- The `agent-polish` tickets (safe command list, tests inside agent environments, commit messages, Grok end to end): tracked separately in `.scratch/agent-polish/` and planned for early M4.
- GitLab and other forges; reading GitHub Issues (ADR 0005).
- Commenting on GitHub pull requests from Stintwork, or syncing findings to PR review comments.
- Squash or rebase options beyond the repository's default merge method.
- Reviewing several work items together, or stacked branches.
- Creating work items and stage files from the UI (M5).

## Further Notes

- **Exit test:** the full acceptance scenario in brief §13, on a second real repo (a copy of PagePilot with its `contract-package` work item). Clarify and Spec are already done there, so start at Implement:
  1. Implement a ticket.
  2. Stop it.
  3. Resume with a different agent.
  4. Change a requirement.
  5. Review with Codex.
  6. Resolve the findings.
  7. Run the checks.
  8. Accept or reject a memory proposal.
  9. Approve the Review gate.
  10. Merge locally (or open a PR, if the developer provides a GitHub test repo).
  11. See the work item shipped with its history.
- **Update `docs/plan.md` M4** to reflect: findings via a follow-up request, checks as configurable local commands plus PR CI, memory proposals derived from diffs, local merge for remote-less repos, and automatic worktree cleanup.
- **Pushing publishes code.** The push confirmation is mandatory and never automatic, consistent with how the coordinator has treated publishing throughout.
