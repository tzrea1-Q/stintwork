# 01 — Antigravity ACP probe

Status: resolved
Blocked by: none

## What to build

Add `--agent antigravity` to `spikes/acp-probe` using installed `agy acp`. Exercise basic, commands, cancel, resume and permission scenarios. Record capabilities, mode and option IDs, version, process cleanup and whether loading a session replays history. Investigate the conflict in the research notes.

## Acceptance criteria

- [x] Probe changes have a runnable self-check and cover all five scenarios without signing in or reading credentials.
- [x] Maintainer action: install `agy` and sign in interactively. Coordinator action: run and record all five authenticated scenarios, version and results; identify a proven minimum version or record the failure. Do not capture credentials.

## Comments

**Coordinator, 2026-11-09:** `agy` was not installed. See `docs/research/2026-11-09-antigravity-acp.md`.

**Codex, 2026-11-09:** Added the Antigravity probe and fake-agent coverage. Changed `spikes/acp-probe/probe.mjs`, `spikes/acp-probe/lib/fake-agent.mjs`, `spikes/acp-probe/selftest.mjs`, `spikes/acp-probe/README.md`, and this ticket. Checks run: `node --check probe.mjs` and `node selftest.mjs` in `spikes/acp-probe` (both passed); `git diff --check` (passed). The selftest used a fake agent; no authenticated Antigravity probe or version floor was established.

**Codex, 2026-11-09:** Fixed review findings: restore observations count message and tool-call history separately and record all update types; advertised load and resume methods run independently, with individual errors retained. Fake-agent selftests cover mixed and non-history updates, load and recall failures, and failures of both methods. Checks run in `spikes/acp-probe`: `node --check probe.mjs` and `node selftest.mjs` (both passed). No real agent was run.

**Codex, 2026-11-09:** Fixed review findings by seeding a separate session for each restore method and failing the scenario when advertised session listing fails while retaining both restore attempts. Fake-agent selftests cover history contamination and listing failure. Checks run in `spikes/acp-probe`: `node --check probe.mjs` and `node selftest.mjs` (both passed). No real agent was run.

**Coordinator, 2026-11-10:** Live probe passed. The maintainer installed Antigravity CLI 1.5.3 on 2026-11-09 with the official installer and signed in interactively with Google. The coordinator did not sign in, read credentials or record any.

Run `2026-11-10T01-32-49-324Z-antigravity` (local, `runs/` is ignored), command `node probe.mjs --agent antigravity --scenario all --timeout-sec 180`, permission mode `ask`, darwin-arm64:

- **Initialize.** ACP protocol 1; agent `Antigravity ACP Server` 1.5.3.
  - Capabilities: `loadSession`, `sessionCapabilities` resume, load, list, close and additionalDirectories, prompt image and embedded context (no audio), and auth logout.
  - Auth methods: `oauth-personal`, `oauth-business`, `gemini-api-key` and `agent-platform`. `terminal-login` was not offered to this client.
- **Session setup.**
  - Modes: `default` ("Ask before edits and commands"), `accept-edits` and `plan`; the current mode is `default`.
  - Config options: `model` (Gemini 3.8 Flash by default; the account's tier also offers Claude and GPT-OSS models), `thought_level` (low, medium or high) and `mode`.
- **basic: pass.** One prompt ended `end_turn` in 11.4 s. The updates included available commands, session info, thoughts, tool calls and message chunks.
- **commands: pass.** 17 commands were advertised, including built-ins such as `plan`, `compact`, `goal` and `teamwork`. The fixture's `/probe-skill` appeared and ran.
- **permission: pass.** Each request offered `allow` (`allow_once`) and `deny` (`reject_once`). Allow created the file and deny did not. No allow-always option was offered.
- **cancel: pass.** A running `sleep 60` stopped with `cancelled`; the cancel was acknowledged in 7 ms.
- **resume: pass.** Each method used its own seeded session, restored in a fresh process.
  - `session/load` recalled HERON and replayed 2 history updates (one user and one agent message chunk).
  - `session/resume` recalled HERON and replayed none.
  - `session/list` listed the original sessions.

  This settles the conflict in the 2026-11-09 research: load replays history and resume does not.
- **Cleanup.** In every scenario `agy acp` ignored SIGTERM and needed SIGKILL. No `agy acp` process was left afterwards, and stderr had no errors.

Proven minimum version: **1.5.3**, the only version tested. A lower version is not proven, so ticket 02 must treat versions below 1.5.3 as below the tested range. Notes for tickets 02–04:
- Map the `ask` permission level to mode `default`.
- Do not use `accept-edits` for levels that should ask.
- Prefer `session/resume` for M10-style recovery, to avoid replaying history.
- Handle a server that ignores SIGTERM.
