# 10 — Guard local workflow writes against developer changes

Status: resolved
Blocked by: 04

## What to build

Protect local work item workflow writes from overwriting staged, unstaged or untracked developer changes, using the same guard as GitHub workflow writes. Preserve rollback on commit failure.

## Acceptance criteria

- [x] A staged workflow edit is refused without changing the file, index or HEAD.
- [x] An unstaged workflow edit is refused without changing the file, index or HEAD.
- [x] A partially staged workflow is refused with its working bytes and staged blob intact.
- [x] An untracked existing workflow is refused without changing it.
- [x] A clean workflow update is committed and leaves the path clean.
- [x] A missing workflow is created and committed.
- [x] Local gate approval returns 503 with localized reason code `workflow.dirtyFile` for a dirty workflow, leaving file and HEAD unchanged.
- [x] In a repository without commits, a missing workflow creates the first commit and a staged workflow is refused unchanged.
- [x] First-stint setup refuses a dirty workflow in an existing worktree without changing its file, index or HEAD.
- [x] Local and GitHub writes refuse workflow files with assume-unchanged or skip-worktree index flags.
- [x] First-stint setup refuses workflow edits or index changes made while its brief is prepared, preserving file and HEAD.
- [x] A failed brief after inheriting stage agents commits unchanged inherited setup edits so a retry can start with them, while preserving developer changes.
- [x] A first stint refused during brief preparation retains first-stint agent setup on retry.

## Comments

**Coordinator, 2026-10-29:** Resolved. Implemented by Codex (gpt-6.1-terra) on `codex/local-workflow-guard`, final head before this comment `2b313e5`. `saveWorkItemWorkflow` now shares the GitHub writer's check (`assertWorkflowUnchanged` in `workflow-writes.ts`): a staged, unstaged, untracked, assume-unchanged or skip-worktree `workflow.yaml` is refused with `workflow.dirtyFile` (en and zh-CN already in the catalogs) before anything is written; a missing file is still created, including in a repository without commits. First-stint setup applies the same rule before inheriting stage agents and again after the brief is prepared; a refusal there creates no stint log and no checkpoint. If the brief fails after inheritance, the unchanged inherited choices are committed so a retry keeps them. The local writer does not take `withRepoLock`, because Ship and local merge already hold that non-reentrant lock when they record a merge. The needs-you spec now states the rule.

Full verify on `2b313e5` passed: format:check, lint, typecheck, build, 3,164 unit tests across 171 files, smoke:package and 376 e2e tests.

Five `codex review --base main` rounds. Fixed: unborn HEAD, the first-stint setup bypass, index flags, the post-brief recheck, inherited edits after a failed brief, and first-stint eligibility after a refusal. Rejected: rechecking when no setup write is needed (a running stint's worktree edits are checkpointed by design, ADR 0004); a workflow committed during the brief window (committed content is kept); and losing inherited choices when the developer discards the workflow (discarding is the developer's choice). Known limit: if a pre-commit hook rejects the inherited setup commit after a failed brief, the workflow stays staged, and the developer must commit or discard it as the refusal says. The existing setup-commit failure path behaves the same way.

Numbered 10 because `codex/local-gate-head` uses 09 for the local gate HEAD race.

Merged to main as `fa150c4`. CI run 40861811135 did not start any job: GitHub reported failed account payments or a spending limit that needs raising. CI evidence for this merge is pending until the maintainer resolves billing and re-runs it.

**Coordinator, 2026-10-31:** Billing restored. Re-run CI run 40861811135 on `fa150c4` passed every job: checks, both browser shards, and package-smoke on ubuntu and macOS. Run 40892196500 on main head `8b130f1`, which includes this change alongside tickets 09, 11 and 12, also passed every job.
