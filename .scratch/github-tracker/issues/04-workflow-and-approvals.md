# 04 — Bind workflow approvals to issue revisions

Status: ready-for-agent
Blocked by: 03

## What to build

Extend the existing workflow and gate path to the issue-keyed worktree file and evidence scheme in the spec. Keep local tracker semantics and existing write/index safeguards. Revalidate remote evidence before and after gate writes; preserve history and expose stale or unknown results.

## Acceptance criteria

- [ ] Create and commit each durable issue-keyed workflow identity record with the repository and parent node IDs, issue number and canonical URL, and validate it before binding existing branches, stints or worktrees.

- [ ] The committed path, identity and YAML evidence follow the spec and worktree authority; unsafe paths, invalid YAML, conflicts and concurrent writes refuse safely.
- [x] Canonical versioned digests cover the defined spec and ticket data, excluding irrelevant changes, with stable deterministic serialization.
- [x] Approval requires complete current evidence and unchanged reviewed HEAD; remote changes or fetch failures before/after commit cannot appear current.
- [ ] Reopen, remote edits, reverted content, code HEAD changes, branch merge/conflict and downstream invalidation follow the spec.
- [ ] Fixture and fake-gh tests cover races and rollback without network; local approvals remain compatible.

## Comments

**Codex, 2026-10-28:** Criterion 3: `packages/core/src/github-evidence.test.ts`, “digest covers each evidence field and is independent of collection order” and “irrelevant metadata and parent comments are excluded, ticket comments are included” prove coverage, determinism and exclusions. `packages/core/src/gates.test.ts`, “GitHub readiness requires fresh complete detail and current preceding approvals” covers projected readiness, and “GitHub reopen and re-approval preserve the reopened record” checks the shared YAML operation. `packages/server/src/github-gates.test.ts`, “concurrent reopen and approval have one winner and leave a valid workflow” and “failed reopen commit restores workflow and index” cover the requested race and rollback. The remaining criteria are not complete: binding-point validation, first-write customisation, reusable fresh-read checks, route-level reopen/re-approval proof and comparison with main's local workflow bytes remain open. No commit was made.

**Codex, 2026-10-28:** Partial stage 3 work: GitHub gate requests now check preceding remote approvals, support reopen, and retain the existing approval when reopened. Snapshot projection propagates stale/unknown state, compares Review evidence with code changes, and warns when the checkout and worktree records differ. The `github-gates` tests cover reopen, stale/unknown refusal, pre/post reads and concurrent approvals; `github-snapshot` covers parent/ticket edits and revert, Review HEAD and divergence; `workflow-writes` covers merged records, index conflict, identity, rollback and paths; `github-evidence` covers canonical fields and exclusions; `review-evidence` covers the code versus bookkeeping rule; and `gates` covers existing local approval and reopen. These checks do not establish all criteria: first-write integration and identity validation at every binding, a reusable fresh-read seam for ticket 05, complete gate readiness enforcement and history preservation, and the remaining requested end-to-end race and local byte-compatibility cases still need work. No additional criterion is ticked. No commit was made.

**Codex, 2026-10-28:** Projected validated GitHub workflow records and per-approval current/stale/unknown evidence into snapshots, with the reviewed digest and HEAD for fresh complete detail. The bilingual gate submits the reviewed values, shows refusal recovery and preserves the returned approval state. The post-check marks cached detail stale on change or failure. Criterion 4 is complete for approval pre/post checks and snapshot display; later dependent-use revalidation, reopen and downstream invalidation remain open.

Checks in this worktree: format:check, lint, typecheck, web/core Vitest (1,645 tests across 89 files) and the GitHub gate and snapshot server tests (11 tests across 2 files). Lint reported the existing Biome deprecation. The GitHub gate browser case was added for the coordinator to run alongside the required bilingual browser acceptance; no e2e or real browser check was run here. No commit was made.

**Codex, 2026-10-28:** Added the GitHub approval route with fresh complete evidence and reviewed HEAD checks, a guarded first-write commit, and a post-commit current/stale/unknown result. Nine fake-gh tests cover refusals, concurrency and spec versus ticket evidence. Criterion 4 remains open: the route reports the immediate post-check, but snapshot projection and revalidation before later dependent use are not yet implemented. GitHub stage readiness and reopen/invalidation integration also remain outstanding.

Checks in this worktree: format:check, lint, typecheck and the requested Vitest selection passed (1,020 tests across 37 files; 9 GitHub gate tests). Lint reported the existing Biome deprecation. No network or project commit was used.

**Codex, 2026-10-28:** Added the optional version 1 remote evidence field to the gate record type and a YAML round-trip test. The GitHub snapshot and approval route are not connected: current GitHub items have no active stage and their committed workflow is not projected into the gate path. Fresh-read and HEAD checks, post-commit revalidation, race coverage and a complete committed approval remain outstanding. No criterion is newly complete; the route remains fail-closed.

Checks in this worktree: format:check, lint and typecheck passed; core/git 1,051 tests and server gates/workflow-writes 19 tests passed. Lint reported the existing Biome deprecation. No network, sockets or commit were used.

**Codex, 2026-10-28:** Started stage 2 with a test-first extension of the guarded writer: a new identity and supplied update can be committed together, and a failed update restores the prior file and index entry. The gate route, reviewed evidence and HEAD checks, post-commit revalidation, snapshot approval states and UI remain unimplemented. No acceptance criterion is newly complete; this is not an approvable GitHub gate yet.

Checks in an isolated copy: format:check, lint and typecheck passed; web/core/git 1,685 tests and the changed server file's 6 tests passed. Lint reported the existing Biome deprecation. No network, sockets or full server suite were used.

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-28:** Started a test-first evidence serialization slice. Version 1 canonical JSON and SHA-256 helpers have focused tests, but are not connected to the GitHub gate or workflow record. Identity creation, worktree writes, approval/reopen revalidation, invalidation, concurrency and UI behavior remain unimplemented; no acceptance criterion is complete. The coordinator must not treat these helpers as approval evidence until the remaining boundary and fail-closed validation are implemented and tested.

Checks for this partial slice: web/core 1,626 tests passed, including three new evidence tests; format, lint, typecheck and `git diff --check` passed. Lint reported the existing Biome deprecation. No server test files were changed or run. The coordinator must run the full server suite outside the socket-restricted sandbox, the nine adapter-cache tests with native process inspection, and the real-repository and bilingual browser acceptance after the remaining implementation. No GitHub reads or writes were made.

**Codex, 2026-10-28:** Started stage 1 test-first. Added a guarded GitHub workflow creation/commit helper, shared path validation, and canonical URL identity validation; focused temporary-repository tests cover creation, identity refusal, unsafe paths, symlinks, malformed YAML, concurrent creation, rollback and local workflow bytes. The helper is not wired into GitHub work-item setup: GitHub items currently have no active stage, and the stint brief path reindexes without GitHub discovery. Existing branch/stint/worktree binding must remain fail-closed until creation is integrated and worktree authority and conflict behavior are tested end to end. Criteria 1 and 2 remain open; remote approval evidence is also stage 2. No commit was made.

Checks in an isolated copy with workspace dependency links: format:check, lint, typecheck and `git diff --check` passed; core/git 1,050 tests and the two changed server files 65 tests passed. Lint reported the existing Biome deprecation. No full server suite, network, sockets or real GitHub operations were run.
