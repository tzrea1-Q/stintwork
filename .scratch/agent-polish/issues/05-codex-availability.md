# 05 — Codex availability detection

Status: resolved
Blocked by: none

## What to build

Claude Code and Grok Build report availability before a stint starts, so a missing CLI or login shows as unavailable in the agent picker and as a login item in Needs you. Codex has no detector, so a missing `codex` CLI or a missing `codex login` only surfaces when a Codex stint fails to start. The README's "Set up your agents" section promises the flag for every agent.

Add a Codex availability detector under the same rules as the existing ones: it never prompts for work and never authenticates.

- `codex` not on PATH: `missing-executable`, with Codex's installation hint. Signing in with `codex login` needs the CLI even though the adapter can fall back to its bundled Codex.
- Codex reports that authentication is required: `login-required`, with a reason naming `codex login`. codex-acp 2.1.1 signals this in `newSession`. It calls `account/read`, and when `requiresOpenaiAuth && !account` it throws ACP `RequestError.authRequired()`. The detector asks the same adapter the stint uses, via `checkAvailability: true`, as the Grok detector does.
- Anything else: `check-failed`.
- The result is cached like the other detectors, and "Refresh agent availability" refreshes it.

## Acceptance criteria

- [x] Agents tests cover missing executable (fake PATH), login required, available, caching and refresh, and show that the probe never prompts or authenticates. They stay hermetic: CODEX* env is cleared and fake executables go on PATH.
- [x] Server tests still skip real detection (STINTWORK_SKIP_AGENT_DETECTION=1).
- [x] In the browser with a fake `codex` that reports auth required, Codex shows as unavailable in the agent picker and a `codex login` item appears in Needs you.
- [x] format:check, lint, typecheck, test and build pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex (codex exec in a worktree, one follow-up for the SPDX headers). `createCodexAgent` in `packages/agents/src/codex.ts` checks for `codex` on PATH, sharing `findExecutable` with Claude Code in `executable.ts`. It then probes the codex-acp adapter with `checkAvailability: true`: no prompt, no `authenticate`, a 20s timeout that cancels and reports `check-failed`. The default registry uses it, and STINTWORK_SKIP_AGENT_DETECTION=1 still strips it. Core and web needed no change because they already handle `login-required` and `missing-executable` for any agent.

Evidence:
- verify.sh on the branch: format:check, lint, typecheck, test, build all PASS. 1625 tests.
- Real adapter probe (codex-cli 0.148.0 on PATH, bundled @openai/codex 0.159.3 via codex-acp 2.1.1):
  - Real login: `{"available":true}` in 8.7s.
  - `CODEX_HOME` set to an empty directory: `login-required`, "Codex authentication required. Sign in with codex login, then start another stint." in 185ms.
  - PATH without codex: `missing-executable`, "Codex not found. Install Codex and sign in with codex login. ...".
  - No session files appeared under `~/.codex/sessions` from the probes.
- Browser: built CLI on a scratch repo with an empty `CODEX_HOME`.
  - Needs you showed 1 item, "LOGIN REQUIRED · CODEX / Codex needs a login", with `codex login` and Refresh agent availability.
  - Every stage agent picker listed "Codex — Codex authentication required. Sign in with codex login, ..." as disabled.
  - The ticket's Brief preview showed the same reason with Start disabled.

Note: the adapter runs its bundled Codex unless CODEX_PATH is set, so the PATH check exists because `codex login` needs the CLI. A machine with valid credentials and no `codex` on PATH is reported unavailable.
