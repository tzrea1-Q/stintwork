# 01 — Antigravity ACP probe

Status: ready-for-agent
Blocked by: none

## What to build

Add `--agent antigravity` to `spikes/acp-probe` using installed `agy acp`. Exercise basic, commands, cancel, resume and permission scenarios. Record capabilities, mode and option IDs, version, process cleanup and whether loading a session replays history. Investigate the conflict in the research notes.

## Acceptance criteria

- [ ] Probe changes have a runnable self-check and cover all five scenarios without signing in or reading credentials.
- [ ] Maintainer action: install `agy` and sign in interactively. Coordinator action: run and record all five authenticated scenarios, version and results; identify a proven minimum version or record the failure. Do not capture credentials.

## Comments

**Coordinator, 2026-11-09:** `agy` was not installed. See `docs/research/2026-11-09-antigravity-acp.md`.

**Codex, 2026-11-09:** Added the Antigravity probe and fake-agent coverage. Changed `spikes/acp-probe/probe.mjs`, `spikes/acp-probe/lib/fake-agent.mjs`, `spikes/acp-probe/selftest.mjs`, `spikes/acp-probe/README.md`, and this ticket. Checks run: `node --check probe.mjs` and `node selftest.mjs` in `spikes/acp-probe` (both passed); `git diff --check` (passed). The selftest used a fake agent; no authenticated Antigravity probe or version floor was established.

**Codex, 2026-11-09:** Fixed review findings: restore observations count message and tool-call history separately and record all update types; advertised load and resume methods run independently, with individual errors retained. Fake-agent selftests cover mixed and non-history updates, load and recall failures, and failures of both methods. Checks run in `spikes/acp-probe`: `node --check probe.mjs` and `node selftest.mjs` (both passed). No real agent was run.

**Codex, 2026-11-09:** Fixed review findings by seeding a separate session for each restore method and failing the scenario when advertised session listing fails while retaining both restore attempts. Fake-agent selftests cover history contamination and listing failure. Checks run in `spikes/acp-probe`: `node --check probe.mjs` and `node selftest.mjs` (both passed). No real agent was run.
