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
