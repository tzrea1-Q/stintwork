# Fast first run

Status: ready-for-agent

Milestone: M9 · Fast first run. See `docs/plan.md`, `docs/brief.md` (§12, §13, §15), `GLOSSARY.md` (Agent, Stint, Project, Work item, Ticket, Milestone), ADR 0002, ADR 0003 and `.scratch/first-release/spec.md`.

## Problem Statement

The maintainer saw a first `npx stintwork@latest` run take a very long time on a real repo. The board waits for agent adapters and their bundled native agent binaries to download, even when the developer already has the agent installed.

Measured in this repo's `node_modules` on darwin-arm64 on 2026-10-17: `@anthropic-ai/claude-agent-sdk-darwin-arm64` is 225 MB and `@openai/codex-*-darwin-arm64` is 317 MB unpacked. They are pulled in by root `package.json` dependencies `@agentclientprotocol/claude-agent-acp` 0.88.0 and `@agentclientprotocol/codex-acp` 2.1.1. These are unpacked sizes, not measured download bytes or a timed baseline.

The first-release spec aimed to show the board in under a minute. M9 makes that a cold-install check without losing the ability to start a real stint with the developer's installed agents and logins.

## Solution

Separate board dependencies from explicit first-use preparation: cache pinned adapters, prefer compatible installed CLIs, and otherwise prepare only that agent's pinned bundled native package under the developer's existing login.

- **Research first.** Inspect how each adapter finds its agent binary, whether it can use the developer's installed CLI, and what Grok Build needs. Measure the root package and dependencies by platform.
- **Compare options.** Include using an installed CLI, installing an adapter on first use into a cache with pinned versions, optional dependencies and the current approach. Do not assume an SDK adapter can run against the standalone CLI.
- **Record the decision.** Ticket 02 records the chosen approach before implementation, preserving ADR 0002's pins and ADR 0003's own-agent/own-login boundary.
- **Implement after the spike.** Tickets 02–07 precede exit ticket 08. Show preparation progress and installed/bundled source and reason at stint start; never download adapters/native agents during board startup or availability refresh.

## User Stories

1. As a developer trying Stintwork, I want the board to open within a minute from an empty npm cache, so that I can try it without a long install.
2. As a developer with an agent installed, I want Stintwork to avoid an unnecessary second native binary download, so that first run stays small.
3. As a developer, I want a real stint to start with each installed agent and my existing login, so that a faster board does not break agent use.
4. As a developer, I want installation failures to explain what happened and how to retry, so that a missing adapter does not leave me stuck.
5. As the maintainer, I want adapter versions pinned and verified, so that moving installation does not silently change the ACP contract.

## Implementation Decisions

- **Chosen approach:** use a verified reusable first-use adapter cache with exact versions and a pinned dependency closure. Omit native packages for proven-compatible installed CLIs; otherwise prepare only the selected agent's pinned bundled native package (Codex 0.159.3 for unproven installed 0.148.0), keeping the developer's login and global CLI unchanged. Research: `docs/research/2026-10-17-first-run.md`.
- **Agent resolution:** trace environment variables, PATH lookup and bundled optional dependencies to the actual launch path for Claude Code and Codex. Record what is supported, what is not, and the installed files that prove it. Include Grok Build's native `grok agent stdio` path.
- **Measurements:** run `npm pack --dry-run` on the root package. Record package versions, packed and unpacked sizes, platform coverage and dependency paths. Separate root tarball size, compressed dependency downloads and unpacked disk size. Mark unavailable platform or download measurements rather than guessing or using network access in the spike.
- **Choice criteria:** compare first-board bytes and time, first-stint setup, compatibility with installed CLIs, pinned versions, cache reuse, offline behaviour and recovery from interrupted or failed installs. The report recommends one approach and sets measurable size and time limits.
- **Decision record:** ticket 02 must be approved before implementation and explain pins and the bundled fallback's relationship to ADR 0002/0003; do not edit existing records silently.
- **Scope after research:** filed tickets 02–07 implement and verify the approved choice; ticket 08 records the exit. Cache layout remains an implementation decision.

## Testing Decisions

- **Docs checks:** `pnpm format:check`, `pnpm lint` and `pnpm vitest run packages/core`. Tickets must parse without warnings and stay in dependency order.
- **Research evidence:** cite local package files and launch paths, record commands and actual results, and distinguish supported behaviour from an untested possibility. Missing local packages or cached download metadata are recorded as limits.
- **Cold install:** use an isolated empty npm cache, not the developer's cache. Time `npx stintwork@latest` or the packed tarball through the board becoming usable in a real repo. Record the version or tarball revision, OS and architecture, connection conditions, elapsed time and downloaded bytes. Compare against the current dependency baseline on the same basis.
- **Real agents:** after the change, start a real stint with each installed agent under the developer's own login. Record the agent and adapter versions and result. A board-only check or fake ACP agent is not proof that a real stint starts.
- **Exit test:** the cold install shows the board within 60 seconds on a typical home connection, the download is a small fraction of today's, and real stints work through compatible installed CLIs or the selected pinned bundled fallback. The spike may tighten the size and time limits. Ticket 08 records all results before M9 is set shipped.

## Out of Scope

- Product implementation during the research spike, or filing implementation tickets before the coordinator reviews its recommendation.
- Installing/upgrading global agent CLIs, signing in, reading credentials or changing agent configuration; only the selected pinned bundled fallback may be prepared at first use.
- Unpinned adapter downloads, changing agent support or the ACP contract without verification.
- Stints surviving restarts, the GitHub tracker and more agents; these remain M10–M12.
- Publishing v0.2 or making the repo public; those belong to M13.
- The outside-developer test and fixes from its findings; those follow the public release, outside v0.2.

## Further Notes

- **Changed 2026-10-17:** the maintainer replaced the feedback-driven M9 with Fast first run. M8 finishes first; M9 does not wait for an outside-developer test.
- The 225 MB and 317 MB observations explain the spike, not its final download budget. The report sets the size and time limits from evidence.
- Exit ticket 08 depends on 01–07; filing these tickets does not pass the exit or change M9's status.
