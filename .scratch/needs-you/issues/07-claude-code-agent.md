# 07 — Claude Code agent

Status: resolved
Blocked by: 01, 03

## What to build

Claude Code joins the registry (spec user stories 26, 29–31; ADR 0003). It launches through the pinned `@agentclientprotocol/claude-agent-acp` against the developer's installed `claude` executable and existing login. Its capability profile, from the probe: modes default, acceptEdits, plan, auto and bypassPermissions; Yes/No permission options; declining doesn't end its turn. Availability detection finds the executable and runs a cheap login check, with results cached and refreshed on demand. When Claude isn't logged in, a `login-required` attention item shows `claude auth login`, and starting is refused with the same hint. Brief, handoff, checkpoints and history work as for Codex.

## Acceptance criteria

- [ ] Server tests with the fake agent using the Claude profile: a full stint (start, permission Yes/No, finish, handoff, checkpoint), and auth-required producing the refusal and the attention item.
- [ ] Availability detection is tested with a missing executable and with a logged-out stub.
- [ ] Manual: a real Claude Code stint on a throwaway repo finishes with a handoff and checkpoint.
- [ ] All checks pass.
