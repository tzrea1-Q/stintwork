# 09 — Guard local workflow writes against developer changes

Status: ready-for-agent
Blocked by: 04

## What to build

Protect local work item workflow writes from overwriting staged, unstaged or untracked developer changes, using the same guard as GitHub workflow writes. Preserve rollback on commit failure.

## Acceptance criteria

- [ ] A staged workflow edit is refused without changing the file, index or HEAD.
- [ ] An unstaged workflow edit is refused without changing the file, index or HEAD.
- [ ] A partially staged workflow is refused with its working bytes and staged blob intact.
- [ ] An untracked existing workflow is refused without changing it.
- [ ] A clean workflow update is committed and leaves the path clean.
- [ ] A missing workflow is created and committed.
- [ ] Local gate approval returns 503 with localized reason code `workflow.dirtyFile` for a dirty workflow, leaving file and HEAD unchanged.

## Comments
