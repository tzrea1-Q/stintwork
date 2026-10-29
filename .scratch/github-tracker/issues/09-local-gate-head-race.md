# 09 — Detect local gate HEAD races

Status: ready-for-agent
Blocked by: 04

## What to build

Detect when a local gate approval commit has a different parent from the reviewed HEAD. Share the GitHub approval history check and project stale local approvals without changing their workflow records.

## Acceptance criteria

- [ ] Local approval responses and snapshots report `head-changed` when HEAD advances during the gate commit, in both the checkout and a worktree.
- [ ] Normal approvals and workflow YAML bytes remain unchanged; later unrelated commits do not make an approval stale.
- [ ] The shared history check follows checkout fallback and rechecks uncommitted records, caching results only after finding their introducing commit.
- [ ] GitHub gate and snapshot behavior remains unchanged, and the specified gate, history and workflow-write tests pass.

## Comments
