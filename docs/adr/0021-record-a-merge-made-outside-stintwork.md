<!-- SPDX-License-Identifier: Apache-2.0 -->
# Record a merge made outside Stintwork

Status: accepted 2026-11-23 by the maintainer.

A work item is Shipped when its change is merged (`GLOSSARY.md`). Stintwork learns that only from its own Ship flow, which writes a merge record to the work item's workflow file. On 2026-11-23 this repository had 12 work items whose milestones were shipped and whose tickets were all resolved. They were built and merged outside Stintwork, so the board inferred them as still in Review.

## Decision

The developer can record that a local Markdown work item was merged outside Stintwork. The action is in the work item detail and needs confirmation. The developer gives the merge commit, prefilled with the main checkout's `HEAD`. Stintwork accepts it only when the commit exists and is reachable from the main checkout's branch. It writes `merged` with `at`, `commit` and `outside: true` to `.scratch/<slug>/workflow.yaml` and commits that file, like every gate write.

The definition of Shipped does not change, and Stintwork does not infer Shipped from milestone status or resolved tickets. The action is unavailable while a stint is running, after a merge is already recorded, while the work item has a Stintwork worktree (its files come from the worktree, ADR 0009, so Ship it or remove the worktree first), and for GitHub-tracked work items, whose shipping closes the parent issue (ADR 0017).
