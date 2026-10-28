# 05 — Start an issue ticket stint

Status: ready-for-agent
Blocked by: 04

## What to build

Connect the selected GitHub ticket to the existing stint and brief flow using the explicit issue references and worktree instructions in the spec. Refresh first, refuse stale or unknown dependencies, and keep issue writes with the agent and its skills.

## Acceptance criteria

- [ ] The brief gives repo, issue identities, URLs, read commands, worktree, scope, handoff and checkpoint without credentials or local ticket instructions.
- [ ] Planning and ticket prompts direct issue updates to the configured skill and `gh`; no issue content is mirrored or written by Stintwork.
- [ ] A fresh complete snapshot is required to start a ticket; resolved, blocked, unknown and changed identities refuse safely.
- [ ] Fake-gh tests verify scope, refresh/failure and unchanged local Markdown briefs and stints without network.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
