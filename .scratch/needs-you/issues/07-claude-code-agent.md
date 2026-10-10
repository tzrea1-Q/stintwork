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

## Comments

**2026-10-10 · implemented by Codex, verified by coordinator.** All checks pass alone (481 tests). Merged after Codex reconciled it with tickets 04 and 05 (all four attention kinds; snapshot validator accepts login-required items). `main`: 573, then 597 tests with ticket 12.

Real Claude Code on a throwaway repo: `GET /api/agents?refresh=true` reported Claude available, from the developer's real login. A stint on a one-line ticket asked permission three times, once per shell command (Claude's default mode asks about every command; ticket 10's levels address this). Each `allow-once` answer returned 200 and took effect. The stint ended `finished` (`end_turn`) with a handoff and checkpoint `b577aae` (Claude's own commit). `claude.txt` was correct and the ticket resolved.

Note: the attention item doesn't carry the permission options. Clients read them from the stint, as the queue UI does. Fine for the UI; worth including when ticket 10 touches the item.
