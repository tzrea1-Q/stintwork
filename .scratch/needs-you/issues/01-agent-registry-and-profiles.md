# 01 — Agent registry and capability profiles

Status: ready-for-agent
Blocked by: none

## What to build

A refactor that makes adding agents easy: no change in behaviour. Today the server hardcodes `"codex"` in start validation, the agent launch, and handoff attribution. Introduce an agent registry: each agent has an id, a display name, a launcher, and a **capability profile** (its ACP modes, whether it supports additional writable directories, its permission option shapes, whether declining ends its turn, how it reports missing logins). Codex is the only registered agent for now. Start requests, stint logs, handoffs and the web picker read the agent from the registry. The scriptable fake agent gains profiles that mimic Codex, Claude Code and Grok Build, for later tickets' tests.

## Acceptance criteria

- [ ] No literal agent ids remain in server logic outside the registry. Existing tests pass unchanged, except where a test asserted the literal.
- [ ] Server test: a start request with an unregistered agent id is refused with a clear reason. A registered fake second agent can start a stint, and its id is recorded in the log, handoff and snapshot.
- [ ] Fake-agent profiles for Codex, Claude Code and Grok Build exist, with their documented mode lists and option shapes (from `docs/research/2026-10-09-spikes.md`).
- [ ] All checks pass.
