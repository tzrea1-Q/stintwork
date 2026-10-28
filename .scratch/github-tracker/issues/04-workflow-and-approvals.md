# 04 — Bind workflow approvals to issue revisions

Status: ready-for-agent
Blocked by: 03

## What to build

Extend the existing workflow and gate path to the issue-keyed worktree file and evidence scheme in the spec. Keep local tracker semantics and existing write/index safeguards. Revalidate remote evidence before and after gate writes; preserve history and expose stale or unknown results.

## Acceptance criteria

- [ ] The committed path, identity and YAML evidence follow the spec and worktree authority; unsafe paths, invalid YAML, conflicts and concurrent writes refuse safely.
- [ ] Canonical versioned digests cover the defined spec and ticket data, excluding irrelevant changes, with stable deterministic serialization.
- [ ] Approval requires complete current evidence and unchanged reviewed HEAD; remote changes or fetch failures before/after commit cannot appear current.
- [ ] Reopen, remote edits, reverted content, code HEAD changes, branch merge/conflict and downstream invalidation follow the spec.
- [ ] Fixture and fake-gh tests cover races and rollback without network; local approvals remain compatible.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
