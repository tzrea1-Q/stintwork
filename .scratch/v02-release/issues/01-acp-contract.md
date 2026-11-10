# 01 — ACP contract test

Status: ready-for-agent
Blocked by: none

## What to build

Turn `spikes/acp-probe/` into a manually run pre-release contract test for Claude Code, Codex, Grok Build and Antigravity CLI. Reuse its scenarios and the shipped profiles, sources and pins. Document commands and per-agent pass rules for basic, commands, Ask permission, cancel and recovery, grounded in the product's actual capability and fallback decisions (including ADRs 0011, 0012 and 0018). Define how unsupported behavior is demonstrated and accepted; an unexercised required behavior is not a pass. The maintainer signs in where needed; the test never logs in.

## Acceptance criteria

- [x] Instructions identify required scenarios, sources, versions, expected results and the evidence needed for each agent; failures, timeouts and unsupported cases have explicit dispositions. Recovery rules distinguish ACP recovery from checkpoint fallback.
- [x] The harness has a runnable check for its contract verdict; a fake-agent pass is not real-agent evidence.
- [ ] At the release revision, all four real agents pass their applicable contract rules. Comments record commands, revision, OS, versions, Agent sources, results and any justified capability limits; sensitive transcripts stay private.
- [ ] Missing login, an untested required behavior or an unexplained unsupported result blocks release; rerun affected evidence if the candidate changes.

## Comments

**Codex, 2026-11-09:** Implemented the manual contract entry point and release verdict checker in `spikes/acp-probe/contract.mjs`, reusing `probe.mjs` with the product's prepared source and executable. Added fake-agent coverage in `contract-selftest.mjs`, the `pnpm test:acp-contract` script in `package.json`, and [contract instructions and evidence rules](../../../spikes/acp-probe/CONTRACT.md), linked from `spikes/acp-probe/README.md`. This ticket records the implementation evidence. Checks: `pnpm test:acp-contract`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm exec vitest run packages/server/src/stint-history.test.ts -t "startup eligibility"` (15 tests) passed. The self-test is fake evidence only. No real agent was run, no login or agent config was accessed, and release-revision criteria 3 and 4 remain open.
