# 02 — Record first-use adapter installation decision

Status: resolved
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

**Codex, 2026-10-17:** Rewrote ADR 0011 as a short decision record: selected-agent preparation only on explicit first use, compatible installed CLI preferred, pinned bundled fallback otherwise, never on board startup/availability refresh. It replaces eager first-release adapter dependencies, retains ADR 0002's pins/probes and narrows ADR 0003 only for first-use fallback downloads, preserving own-login/no-credentials. Moved missing probe evidence/release rules to 03, lock/pin/cache/launch details to 04, packaging/offline/source UI details to 05, security/failure regression cases to 06, and measurement/accounting details to 07. Kept the minimal glossary change. Maintainer approval of the record remains required before implementation; compatible-pair and measured response-body evidence remain pending. No Status changes, product code, existing ADR edits or commit.

Checks: `pnpm --config.verify-deps-before-run=false format:check` and `pnpm --config.verify-deps-before-run=false lint` passed; lint reports the existing informational `biome.json:24` deprecation. These checks do not cover Markdown; word-count, whitespace, relative-link, checkbox-count and scope guards passed separately. No runtime, compatibility, package or cold-install tests were run for this documentation revision.

**Coordinator, 2026-10-17:** Reviewed; shortened to repo ADR length on request. Waiting for the maintainer to approve ADR 0011 (the narrow ADR 0003 change) before ticket 04 starts. Ticket 03 proceeds meanwhile.

**Coordinator, 2026-10-17:** The maintainer approved ADR 0011 (including the tested-range rule) in chat. Resolved; ticket 04 starts.
