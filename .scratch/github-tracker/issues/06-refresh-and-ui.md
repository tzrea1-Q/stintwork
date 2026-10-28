# 06 — Show freshness and recovery on the board

Status: ready-for-agent
Blocked by: 05

## What to build

Implement the specified open, post-stint and explicit refresh lifecycle, scoped in-memory snapshot and bilingual board/work-item states in the shared model and existing views. Follow `docs/agents/frontend.md`.

## Acceptance criteria

- [ ] Implement automatic project-open, post-stint and pre-action refresh, detect login changes, and show the last same-login snapshot read-only when offline.

- [ ] Fresh, stale, partial, offline and no-snapshot states expose fetch time and completeness; unknown blockers and approvals cannot look ready.
- [ ] Missing gh, login, access/404, rate limit, network and incomplete states use the specified English and Chinese copy and offer retry.
- [ ] Identity/login changes clear cached private data; rate limits and bounded concurrency are respected.
- [ ] Behavior and keyboard tests use fixtures and fake gh without network; local tracker remains usable.
- [ ] Coordinator runs browser layout cases at 1440, 1024, 768 and 390 in both languages, required colour schemes and records 1440/390 visual review; these require browser and local sockets.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
