# 04 — Bind workflow approvals to issue revisions

Status: ready-for-agent
Blocked by: 03

## What to build

Extend the existing workflow and gate path to the issue-keyed worktree file and evidence scheme in the spec. Keep local tracker semantics and existing write/index safeguards. Revalidate remote evidence before and after gate writes; preserve history and expose stale or unknown results.

## Acceptance criteria

- [ ] Create and commit each durable issue-keyed workflow identity record with the repository and parent node IDs, issue number and canonical URL, and validate it before binding existing branches, stints or worktrees.

- [ ] The committed path, identity and YAML evidence follow the spec and worktree authority; unsafe paths, invalid YAML, conflicts and concurrent writes refuse safely.
- [ ] Canonical versioned digests cover the defined spec and ticket data, excluding irrelevant changes, with stable deterministic serialization.
- [ ] Approval requires complete current evidence and unchanged reviewed HEAD; remote changes or fetch failures before/after commit cannot appear current.
- [ ] Reopen, remote edits, reverted content, code HEAD changes, branch merge/conflict and downstream invalidation follow the spec.
- [ ] Fixture and fake-gh tests cover races and rollback without network; local approvals remain compatible.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-28:** Started a test-first evidence serialization slice. Version 1 canonical JSON and SHA-256 helpers have focused tests, but are not connected to the GitHub gate or workflow record. Identity creation, worktree writes, approval/reopen revalidation, invalidation, concurrency and UI behavior remain unimplemented; no acceptance criterion is complete. The coordinator must not treat these helpers as approval evidence until the remaining boundary and fail-closed validation are implemented and tested.

Checks for this partial slice: web/core 1,626 tests passed, including three new evidence tests; format, lint, typecheck and `git diff --check` passed. Lint reported the existing Biome deprecation. No server test files were changed or run. The coordinator must run the full server suite outside the socket-restricted sandbox, the nine adapter-cache tests with native process inspection, and the real-repository and bilingual browser acceptance after the remaining implementation. No GitHub reads or writes were made.

**Codex, 2026-10-28:** Started stage 1 test-first. Added a guarded GitHub workflow creation/commit helper, shared path validation, and canonical URL identity validation; focused temporary-repository tests cover creation, identity refusal, unsafe paths, symlinks, malformed YAML, concurrent creation, rollback and local workflow bytes. The helper is not wired into GitHub work-item setup: GitHub items currently have no active stage, and the stint brief path reindexes without GitHub discovery. Existing branch/stint/worktree binding must remain fail-closed until creation is integrated and worktree authority and conflict behavior are tested end to end. Criteria 1 and 2 remain open; remote approval evidence is also stage 2. No commit was made.

Checks in an isolated copy with workspace dependency links: format:check, lint, typecheck and `git diff --check` passed; core/git 1,050 tests and the two changed server files 65 tests passed. Lint reported the existing Biome deprecation. No full server suite, network, sockets or real GitHub operations were run.
