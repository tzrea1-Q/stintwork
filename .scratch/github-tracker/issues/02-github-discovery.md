# 02 — Discover GitHub work items

Status: ready-for-agent
Blocked by: 01

## What to build

Implement the configured GitHub project boundary, explicit github.com origin and identity validation, bounded top-level issue discovery and shared model integration from the spec. Preserve local setup and indexing. Use recorded sanitized JSON and a fake `gh`; no network. Deliver discovery with visible completeness/error data usable by the board.

## Acceptance criteria

- [ ] GitHub setup selects the explicit repository without replacing tracker config; invalid host, origin, access and identity are safe errors.
- [ ] Top-level issues qualify with a direct same-repo sub-issue or the label; unlabelled parents with children and labelled standalone specs appear, unrelated epics are accepted, and PRs and child issues are excluded with specified warnings.
- [ ] GraphQL scans at most 500 issues per batch and checks independently paginated labels and sub-issues for same-repo membership; load more, actual page costs and incomplete results are represented, and stable identities do not silently remap.
- [ ] Recorded JSON and fake-gh fixtures cover unlabelled parents, labelled standalone specs, unrelated epics, PRs, nested/cross-repo children, membership beyond the first relationship page, failed/capped pages, rename/transfer, 404 and local Markdown regression.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-27:** Started the repository boundary with a test-first, read-only `gh` helper that rejects unsafe origins and checks the returned repository name and node ID. It is not yet connected to setup or the project snapshot. Discovery, pagination, identity retention, failure states, and board integration remain to be implemented; no acceptance criterion is complete. The focused fake-`gh` suite passed 5 tests. Format, lint (existing Biome deprecation notice), and typecheck passed. The full server suite was interrupted after producing no results for over a minute; the coordinator must rerun it, and run the real `gh`/network exit and browser acceptance once implementation is complete.

**Codex, 2026-10-27:** Continued with GitHub-aware setup, a read-only GraphQL issue scan (five pages of 100 per batch, independently paginated labels and sub-issues, per-request rate data), a load-more/refresh server seam, and discovery data in the project snapshot. GitHub items are not associated with existing local stints or worktrees without durable identity binding. The sanitized fixture and fake `gh` exercised discovery, a later same-repository child page, a failed relationship page, batch limit, rate reset and the socket-free snapshot; 11 discovery tests and 26 setup tests passed, plus the socket-free case of `index.test.ts`. Core/agents/git: 1,476 passed, nine agent-cache tests failed because native process-table inspection is unavailable in the sandbox. The full server suite and the remaining socket-based snapshot cases were not run. This ticket remains incomplete: durable repository/issue identity across restart, login-scoped stale snapshots, complete error classification and required fixture coverage (including 404, PRs, capped and later label pages) still need implementation and verification. The fixture is synthetic and sanitized, not a recorded live response. The coordinator must run the full server suite, the nine agent-cache tests with native process inspection, and the real `gh`/network and browser exit after the remaining implementation. Format, lint and typecheck passed; lint reported the existing Biome deprecation. Tests used temporary aliases because workspace dependency links resolve to the original checkout; an additional server typecheck used worktree source aliases. No GitHub writes were run.
