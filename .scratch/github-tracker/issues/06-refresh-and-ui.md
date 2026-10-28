# 06 — Show freshness and recovery on the board

Status: ready-for-agent
Blocked by: 05

## What to build

Implement the specified open, post-stint and explicit refresh lifecycle, scoped in-memory snapshot and bilingual board/work-item states in the shared model and existing views. Follow `docs/agents/frontend.md`.

## Acceptance criteria

- [ ] Implement automatic project-open, post-stint and pre-action refresh; start discovery when the tracker changes to GitHub during server operation (file watcher or setup), detect login changes, and show the last same-login snapshot read-only when offline.

- [ ] Fresh, stale, partial, capped, offline, failure and no-snapshot states expose fetch time, completeness and the load-more cursor, with refresh and Load more controls; an unavailable repository never looks empty, a partial result never looks complete, and unknown blockers and approvals cannot look ready.
- [ ] Missing gh, login, access/404, rate limit, network and incomplete states use the specified English and Chinese copy and offer retry.
- [ ] Identity/login changes clear cached private data; rate limits and bounded concurrency are respected.
- [ ] Behavior and keyboard tests use fixtures and fake gh without network; local tracker remains usable.
- [ ] Coordinator runs browser layout cases at 1440, 1024, 768 and 390 in both languages, required colour schemes and records 1440/390 visual review; these require browser and local sockets.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-27:** The coordinator assigned two fourth-round Codex review findings to this ticket: visible discovery failure, incomplete/capped results and load-more recovery on the board (see `docs/agents/frontend.md` layout and states), and starting discovery when the detected tracker changes to GitHub without a server restart. The acceptance criteria above cover both.
