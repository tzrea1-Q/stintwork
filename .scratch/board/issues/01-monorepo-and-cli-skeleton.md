# 01 — Monorepo skeleton and a CLI that serves a page

Status: resolved
Blocked by: none

## What to build

The workspace every later ticket builds on, proven end to end by a CLI that serves a page.

- A pnpm workspace at the repo root (Node 22+, TypeScript strict, ESM) with packages `core`, `server`, `web`, `cli` under `packages/` (`@stintwork/core`, `@stintwork/server`, `@stintwork/web`, and `stintwork` for the CLI). Leave `prototype/` and `spikes/` out of the workspace.
- Vitest, Biome and `tsc --noEmit`, with root scripts `test`, `typecheck`, `lint`, `format:check`, `build`, plus `stintwork` (runs the CLI from source).
- `cli`: finds the git root from the current directory, starts the server, prints the URL, and opens the browser unless `--no-open`. Exits non-zero with a clear message outside a git repo. Prefers port 4317, or the next free port.
- `server`: Hono. `GET /api/health` returns `{ ok: true, repo: "<name>" }` and serves the built `web` app.
- `web`: Vite + React + Tailwind v4, with a placeholder page that fetches `/api/health` and shows the repo name.
- A GitHub Actions workflow running the root checks on Node 22.

## Acceptance checks

- `pnpm stintwork --no-open` in this repo prints a localhost URL, and `/api/health` returns the repo name `stintwork`.
- Vitest: `cli finds the git root from a nested directory`; `cli exits non-zero outside a git repo`; `cli falls back to the next free port when 4317 is busy`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass.

## Out of scope

Indexing `.scratch/`, WebSocket, any UI beyond the placeholder.

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** After `pnpm install`: `pnpm format:check`, `lint`, `typecheck`, `test` (6 tests, including the three named checks) and `build` all pass. `pnpm stintwork --no-open` prints `http://localhost:4317`, `/api/health` returns `{"ok":true,"repo":...}`, and the built page is served. Run from `/tmp`, the CLI exits 1 with "Not inside a Git repository".
