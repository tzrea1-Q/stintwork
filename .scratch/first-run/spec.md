# Fast first run

Status: ready-for-agent

Milestone: M9 · Fast first run. See `docs/plan.md`, `docs/brief.md` (§12, §13, §15), `GLOSSARY.md` (Agent, Stint, Project, Work item, Ticket, Milestone), ADR 0002, ADR 0003 and `.scratch/first-release/spec.md`.

## Problem Statement

The maintainer saw a first `npx stintwork@latest` run take a very long time on a real repo. The board waits for agent adapters and their bundled native agent binaries to download, even when the developer already has the agent installed.

Measured in this repo's `node_modules` on darwin-arm64 on 2026-10-17: `@anthropic-ai/claude-agent-sdk-darwin-arm64` is 225 MB and `@openai/codex-*-darwin-arm64` is 317 MB unpacked. They are pulled in by root `package.json` dependencies `@agentclientprotocol/claude-agent-acp` 0.88.0 and `@agentclientprotocol/codex-acp` 2.1.1. These are unpacked sizes, not measured download bytes or a timed baseline.

The first-release spec aimed to show the board in under a minute. M9 makes that a cold-install check without losing the ability to start a real stint with the developer's installed agents and logins.

## Solution

Research the installed adapters before choosing an installation change. Separate the dependencies needed to show the board from those needed to start a stint.

- **Research first.** Inspect how each adapter finds its agent binary, whether it can use the developer's installed CLI, and what Grok Build needs. Measure the root package and dependencies by platform.
- **Compare options.** Include using an installed CLI, installing an adapter on first use into a cache with pinned versions, optional dependencies and the current approach. Do not assume an SDK adapter can run against the standalone CLI.
- **Record the decision.** If the recommendation changes how adapters are installed, write a decision record before implementation. Preserve ADR 0002's pinned adapter-version guarantee and ADR 0003's own-agent and own-login boundary.
- **Implement after the spike.** The spike proposes implementation tickets in Comments. The coordinator files them in dependency order before the exit ticket and adds them to its blockers.

## User Stories

1. As a developer trying Stintwork, I want the board to open within a minute from an empty npm cache, so that I can try it without a long install.
2. As a developer with an agent installed, I want Stintwork to avoid an unnecessary second native binary download, so that first run stays small.
3. As a developer, I want a real stint to start with each installed agent and my existing login, so that a faster board does not break agent use.
4. As a developer, I want installation failures to explain what happened and how to retry, so that a missing adapter does not leave me stuck.
5. As the maintainer, I want adapter versions pinned and verified, so that moving installation does not silently change the ACP contract.

## Implementation Decisions

- **No installation choice yet:** ticket 01 inspects local `node_modules` and package metadata without network access. Its report is `docs/research/2026-10-17-first-run.md`.
- **Agent resolution:** trace environment variables, PATH lookup and bundled optional dependencies to the actual launch path for Claude Code and Codex. Record what is supported, what is not, and the installed files that prove it. Include Grok Build's native `grok agent stdio` path.
- **Measurements:** run `npm pack --dry-run` on the root package. Record package versions, packed and unpacked sizes, platform coverage and dependency paths. Separate root tarball size, compressed dependency downloads and unpacked disk size. Mark unavailable platform or download measurements rather than guessing or using network access in the spike.
- **Choice criteria:** compare first-board bytes and time, first-stint setup, compatibility with installed CLIs, pinned versions, cache reuse, offline behaviour and recovery from interrupted or failed installs. The report recommends one approach and sets measurable size and time limits.
- **Decision record:** if installation changes, propose a ticket for the new record before implementation. It must explain how pinned adapter versions remain guaranteed and how it relates to ADR 0002; do not edit existing decision records silently.
- **Scope after research:** the coordinator files the proposed implementation and verification tickets. This spec does not prescribe a cache layout or add an installation mechanism before the spike.

## Testing Decisions

- **Docs checks:** `pnpm format:check`, `pnpm lint` and `pnpm vitest run packages/core`. Tickets must parse without warnings and stay in dependency order.
- **Research evidence:** cite local package files and launch paths, record commands and actual results, and distinguish supported behaviour from an untested possibility. Missing local packages or cached download metadata are recorded as limits.
- **Cold install:** use an isolated empty npm cache, not the developer's cache. Time `npx stintwork@latest` or the packed tarball through the board becoming usable in a real repo. Record the version or tarball revision, OS and architecture, connection conditions, elapsed time and downloaded bytes. Compare against the current dependency baseline on the same basis.
- **Real agents:** after the change, start a real stint with each installed agent under the developer's own login. Record the agent and adapter versions and result. A board-only check or fake ACP agent is not proof that a real stint starts.
- **Exit test:** the cold install shows the board within 60 seconds on a typical home connection, the download is a small fraction of today's, and a real stint still starts with each installed agent. The spike may tighten the size and time limits. Ticket 02 records all results before M9 is set shipped.

## Out of Scope

- Product implementation during the research spike, or filing implementation tickets before the coordinator reviews its recommendation.
- Installing agents, signing in, reading credentials or changing the developer's agent configuration.
- Unpinned adapter downloads, changing agent support or the ACP contract without verification.
- Stints surviving restarts, the GitHub tracker and more agents; these remain M10–M12.
- Publishing v0.2 or making the repo public; those belong to M13.
- The outside-developer test and fixes from its findings; those follow the public release, outside v0.2.

## Further Notes

- **Changed 2026-10-17:** the maintainer replaced the feedback-driven M9 with Fast first run. M8 finishes first; M9 does not wait for an outside-developer test.
- The 225 MB and 317 MB observations explain the spike, not its final download budget. The report sets the size and time limits from evidence.
- The exit ticket initially depends only on 01. The coordinator inserts implementation tickets before it and updates its `Blocked by` line when filing them.
