# 01 — ACP contract test

Status: ready-for-human
Blocked by: none

## What to build

Turn `spikes/acp-probe/` into a manually run pre-release contract test for Claude Code, Codex, Grok Build and Antigravity CLI. Reuse its scenarios and the shipped profiles, sources and pins. Document commands and per-agent pass rules for basic, commands, Ask permission, cancel and recovery, grounded in the product's actual capability and fallback decisions (including ADRs 0011, 0012 and 0018). Define how unsupported behavior is demonstrated and accepted; an unexercised required behavior is not a pass. The maintainer signs in where needed; the test never logs in.

## Acceptance criteria

- [x] Instructions identify required scenarios, sources, versions, expected results and the evidence needed for each agent; failures, timeouts and unsupported cases have explicit dispositions. Recovery rules distinguish ACP recovery from checkpoint fallback.
- [x] The harness has a runnable check for its contract verdict; a fake-agent pass is not real-agent evidence.
- [ ] At the release revision, all four real agents pass their applicable contract rules. Comments record commands, revision, OS, versions, Agent sources, results and any justified capability limits; sensitive transcripts stay private.
- [ ] Missing login, an untested required behavior or an unexplained unsupported result blocks release; rerun affected evidence if the candidate changes.

## Comments

**Codex, 2026-11-09:** Tightened `--check` to reject stale revisions and dirty working trees, and require both process observations to establish unsupported recovery; added regression self-tests. Real-agent release evidence remains outstanding.

**Codex, 2026-11-09:** Implemented the manual contract entry point and release verdict checker in `spikes/acp-probe/contract.mjs`, reusing `probe.mjs` with the product's prepared source and executable. Added fake-agent coverage in `contract-selftest.mjs`, the `pnpm test:acp-contract` script in `package.json`, and [contract instructions and evidence rules](../../../spikes/acp-probe/CONTRACT.md), linked from `spikes/acp-probe/README.md`. This ticket records the implementation evidence. Checks: `pnpm test:acp-contract`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm exec vitest run packages/server/src/stint-history.test.ts -t "startup eligibility"` (15 tests) passed. The self-test is fake evidence only. No real agent was run, no login or agent config was accessed, and release-revision criteria 3 and 4 remain open.

**Codex, 2026-11-09:** Restricted contract run directories to owner-only mode `0o700` before writing evidence; POSIX self-test covers new and existing directories. `pnpm test:acp-contract`, `pnpm format:check`, and `pnpm lint` passed (lint reported existing warnings).

**Coordinator, 2026-11-10:** The harness and pass rules (criteria 1–2) are merged in `9e5f53e` after three review rounds. Rounds 2 and 3 added rejection of stale or dirty revisions, a recovery exception that needs both processes to show no load/resume, and owner-only run directories. The self-test passes. Criteria 3–4 wait for the release revision, which in turn waits for the M11/M12 exits and the M7 confirmations. Under these rules Grok is blocked by its always-approve config: Ask cannot be exercised while it is set, and only the maintainer can change it.

**Codex, 2026-11-10:** Applied the maintainer's v0.2 decision: Grok remains experimental, and its account rate limiting and Ask scenario with no permission requests are accepted limitations, not proof of permission support. The verdict lists each accepted limitation; other failures and missing evidence still block. M12 verified Antigravity by a real stint; Grok's real stints were rate limited (agent-polish 04). Real-agent release evidence remains outstanding.

**Coordinator, 2026-11-10: real contract run on the release candidate.** Command: `node --conditions=development --import tsx spikes/acp-probe/contract.mjs --run`, then `node spikes/acp-probe/contract.mjs --check <run>` → "Release contract passed". Run `contract-2026-11-10T08-50-04-455Z` (local, owner-only, gitignored), revision `2b782f4` (version 0.2.0), clean tree, darwin-arm64, Node 22.22.3. Server checkpoint fallback test passed.

| Agent | Source, version | basic | commands | Ask permission | cancel | ACP recovery | checkpoint fallback |
|---|---|---|---|---|---|---|---|
| Claude Code | Installed 2.1.295 | pass | pass | pass (allow wrote, reject did not) | pass | pass, `loadSession` | — |
| Codex | Installed 0.163.0 | pass | pass | pass (allow wrote, reject did not) | pass | pass, `loadSession` | — |
| Antigravity CLI | Installed 1.5.3 | pass | pass | pass (allow wrote, reject did not) | pass | pass, `loadSession` | pass |
| Grok Build | Installed 1.0.77 | accepted limitation | accepted limitation | accepted limitation | accepted limitation | accepted limitation | pass |

Every Grok scenario failed with ACP error -32003 "Rate limited"; the raw error is HTTP 429 `subscription:free-usage-exhausted`, i.e. the account's included usage is exhausted. Under the maintainer's 2026-11-10 decision this is an accepted limitation, listed in the verdict output, and is not a pass or permission support. The coordinator reviewed the probe summaries for all four agents; no transcript content is copied here. Antigravity 1.5.3 supports new-process `session/load`, which is relevant to more-agents 07. Docs-only commits follow this revision, so the contract is rerun on the final revision before publication.
