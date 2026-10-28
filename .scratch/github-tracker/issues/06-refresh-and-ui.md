# 06 — Show freshness and recovery on the board

Status: ready-for-agent
Blocked by: 05

## What to build

Implement the specified open, post-stint and explicit refresh lifecycle, scoped in-memory snapshot and bilingual board/work-item states in the shared model and existing views. Follow `docs/agents/frontend.md`.

## Acceptance criteria

- [x] Implement automatic project-open, post-stint and pre-action refresh; start discovery when the tracker changes to GitHub during server operation (file watcher or setup), detect login changes, and show the last same-login snapshot read-only when offline.

- [x] Fresh, stale, partial, capped, offline, failure and no-snapshot states expose fetch time, completeness and the load-more cursor, with refresh and Load more controls; an unavailable repository never looks empty, a partial result never looks complete, and unknown blockers and approvals cannot look ready.
- [x] Missing gh, login, access/404, rate limit, network and incomplete states use the specified English and Chinese copy and offer retry.
- [x] Identity/login changes clear cached private data; rate limits and bounded concurrency are respected.
- [x] Behavior and keyboard tests use fixtures and fake gh without network; local tracker remains usable.
- [ ] Coordinator runs browser layout cases at 1440, 1024, 768 and 390 in both languages, required colour schemes and records 1440/390 visual review; these require browser and local sockets.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-27:** The coordinator assigned two fourth-round Codex review findings to this ticket: visible discovery failure, incomplete/capped results and load-more recovery on the board (see `docs/agents/frontend.md` layout and states), and starting discovery when the detected tracker changes to GitHub without a server restart. The acceptance criteria above cover both.

**Codex, 2026-10-28:** Added runtime tracker discovery and identity-scoped cache clearing, bilingual board freshness and recovery controls, and read-only stale stint and gate actions. Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (warnings only), `pnpm typecheck`, `pnpm build`, and `pnpm exec vitest run packages/server/src/github-lifecycle.test.ts packages/web/src/Board.test.tsx` (41 passed). Added the GitHub partial-board Playwright case; its run could not start because the sandbox rejected `listen 127.0.0.1:4178` with `EPERM`. Coordinator browser layout and visual review remain outstanding. No commit made.

**Codex, 2026-10-28:** Corrected the bilingual GitHub status catalog entries, retry deadline timing, and drawer read-only scope for discovery and individual detail failures. Added fake-timer, drawer, and server freshness regression coverage. Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (warnings only), `pnpm typecheck`, and Vitest for the requested catalog, Board, GitHub status, lifecycle and stint files plus `github-detail-refresh.test.ts` (155 passed). Coordinator browser layout and visual review remain outstanding. No commit made.

**Codex, 2026-10-28:** Fixed board freshness and Retry to use discovery failure rather than item-detail staleness, and kept Load more available while a cursor remains. Added regression coverage and updated discovery-failure fixtures. Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), `pnpm typecheck`, and `pnpm vitest run packages/web/src/GithubStatus.test.tsx packages/web/src/Board.test.tsx packages/web/src/i18n/catalog.test.ts` (101 passed). Coordinator browser layout and visual review remain outstanding. No commit made.

**Codex, 2026-10-28:** Refresh GitHub work-item detail on drawer opening, reuse the gate refresh request and reload the snapshot, and show pending and failure states. Discovery now distinguishes remaining pages from incomplete connections, shows affected membership counts and localized warning details. Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), `pnpm typecheck`, and the requested four-file Vitest run (113 passed). Coordinator browser layout and visual review remain outstanding. No commit made.

**Codex, 2026-10-28:** Added client-scoped GitHub viewer checks with identity cache invalidation and fresh discovery, and bounded drawer detail-refresh retries with a Retry control after conflicts. Added lifecycle and drawer regression coverage. Checks: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the requested four-file Vitest run; the live WebSocket lifecycle case cannot bind in this sandbox (`listen EPERM`) and requires a socket-enabled run. Coordinator browser layout and visual review remain outstanding. No commit made.
