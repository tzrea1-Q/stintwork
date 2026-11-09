# 01 — ACP contract test

Status: ready-for-agent
Blocked by: none

## What to build

Turn `spikes/acp-probe/` into a manually run pre-release contract test for Claude Code, Codex, Grok Build and Antigravity CLI. Reuse its scenarios and the shipped profiles, sources and pins. Document commands and per-agent pass rules for basic, commands, Ask permission, cancel and recovery, grounded in the product's actual capability and fallback decisions (including ADRs 0011, 0012 and 0018). Define how unsupported behavior is demonstrated and accepted; an unexercised required behavior is not a pass. The maintainer signs in where needed; the test never logs in.

## Acceptance criteria

- [ ] Instructions identify required scenarios, sources, versions, expected results and the evidence needed for each agent; failures, timeouts and unsupported cases have explicit dispositions. Recovery rules distinguish ACP recovery from checkpoint fallback.
- [ ] The harness has a runnable check for its contract verdict; a fake-agent pass is not real-agent evidence.
- [ ] At the release revision, all four real agents pass their applicable contract rules. Comments record commands, revision, OS, versions, Agent sources, results and any justified capability limits; sensitive transcripts stay private.
- [ ] Missing login, an untested required behavior or an unexplained unsupported result blocks release; rerun affected evidence if the candidate changes.

## Comments
