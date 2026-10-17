# 01 — Install research spike

Status: ready-for-agent
Blocked by: none

## What to build

Write `docs/research/2026-10-17-first-run.md`. Read this work item's spec, the first-release packaging decisions, ADR 0002 and ADR 0003. Inspect the installed adapter packages in `node_modules`; no network is needed. Do not change product code, dependencies or decision records in this spike.

Trace how `@agentclientprotocol/claude-agent-acp` 0.88.0 and `@agentclientprotocol/codex-acp` 2.1.1 locate and launch their agent binaries. Check environment variables, PATH and bundled optional dependencies. Find whether each adapter supports the developer's installed `claude` or `codex` CLI, and what interface or version it requires. Do not treat a binary-path override as proof that the standalone CLI is compatible. Record what Grok Build needs for `grok agent stdio` and whether it adds an install-time download.

Run `npm pack --dry-run` on the root package and record its packed and unpacked sizes and contents. Trace the native dependency packages by platform. Start from the 2026-10-17 darwin-arm64 observations: 225 MB for `@anthropic-ai/claude-agent-sdk-darwin-arm64` and 317 MB for `@openai/codex-*-darwin-arm64`, unpacked. Record exact installed package names and versions. Separate unpacked disk sizes from compressed download bytes, and root-package bytes from transitive dependencies. Use installed metadata and cached artifacts; record unavailable platform or download measurements without fetching packages. Record any pack/build restriction rather than claiming it ran.

Compare the current approach, using the installed CLI where supported, installing an adapter on first use into a cache with pinned versions, and optional dependencies. Explain which downloads each option actually avoids. Cover first-board and first-stint cost, cache reuse, offline use, interrupted or failed installs and compatibility. Recommend one approach. Set a concrete download budget for a small fraction of today's baseline and a time limit no looser than 60 seconds, with a repeatable cold-install measurement procedure.

Propose implementation tickets in this ticket's Comments, with scope, acceptance criteria and dependencies. If installation changes, include a decision-record ticket before implementation that preserves ADR 0002's pinned adapter-version guarantee and ADR 0003's own-agent and own-login boundary. The coordinator reviews and files the tickets before the M9 exit ticket and updates its blockers; do not file them in this spike.

## Acceptance criteria

- [ ] The report cites installed source and metadata for both adapters' actual binary-resolution paths, supported overrides and installed-CLI compatibility. Unknown or untested claims are marked.
- [ ] Grok Build's launch prerequisites and install-time download needs are recorded.
- [ ] Root `npm pack --dry-run` results and per-platform dependency sizes are recorded with commands, versions and units. Compressed and unpacked sizes are separate; unavailable measurements and command failures are explicit.
- [ ] Options are compared and one is recommended, including pinned versions, offline behaviour and failed-install recovery. No product code or dependency changes are made.
- [ ] The report sets measurable download and time limits and a cold-install procedure; the board limit is at most 60 seconds on a typical home connection.
- [ ] Comments propose implementation and verification tickets in dependency order, including a decision record before implementation if installation changes. Filing them remains the coordinator's work.
- [ ] Comments record the checks actually run and any limits. The report is evidence for the choice, not a claim that the M9 exit already passes.

## Comments
