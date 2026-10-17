# 02 — Record first-use adapter installation decision

Status: ready-for-agent
Blocked by: 01

## What to build

Write a new decision record for the chosen first-use installation approach, using `docs/research/2026-10-17-first-run.md` and this work item's spec. Relate it to first-release packaging and ADR 0002/0003 without silently rewriting existing decisions. Get the decision approved before implementation.

Keep adapters pinned to `@agentclientprotocol/claude-agent-acp@0.88.0` and `@agentclientprotocol/codex-acp@2.1.1`, with a release-controlled transitive dependency lock and integrity policy. Prepare only the selected agent on explicit first use in a reusable user-owned cache. Prefer a proven-compatible installed CLI and omit native packages on that path. If no compatible installed version is available, include that agent's pinned bundled native package instead, using the developer's existing login as today. Do not replace or upgrade their global CLI. Show preparation progress and the chosen executable source and reason at stint start; no adapter or native package is downloaded during board startup or availability refresh. Grok stays native `grok agent stdio`.

Define cache identity/ownership, atomic preparation, offline/retry behavior and compatibility evidence requirements. Keep the report's board budget: <=60 seconds, <=10 MiB registry response bodies and <=10% of a comparable measured baseline; account for first-stint downloads separately.

## Acceptance criteria

- [ ] A new approved decision record links the research, first-release packaging and ADR 0002/0003; existing records are not silently changed.
- [ ] Exact adapter/native versions, transitive lock/integrity policy and probe requirements are recorded, with no unpinned runtime selection.
- [ ] Compatible installed CLI and selected-agent-only bundled fallback paths are defined, including UI source/reason and first-use progress.
- [ ] Board startup and availability refresh never prepare/download agents; global CLIs and developer-owned logins are unchanged, with no credential handling.
- [ ] Cache ownership, offline/failure recovery and separate board/first-stint measurement budgets are explicit.

## Comments
