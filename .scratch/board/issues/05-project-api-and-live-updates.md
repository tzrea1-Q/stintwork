# 05 — Project API and live updates

Status: resolved
Blocked by: 03, 04

## What to build

In `packages/server`: wire the core index to the real filesystem and push changes to the browser.

- On start, read the repo's `.scratch/**`, `.stintwork/**` and setup files, and build the index with core.
- `GET /api/project` returns the full snapshot: project name, workflows, milestones, work items with tickets and stages, the setup report, and warnings.
- Watch the same paths (chokidar or `fs.watch`), debounce about 150 ms, re-index, and broadcast the new snapshot to WebSocket clients on `/api/live`.
- Keep the snapshot shape a single exported type from core, so `web` imports it rather than redefining it.

## Acceptance checks

- Vitest, with a temp-dir git fixture: `GET /api/project returns indexed work items`; `editing a ticket Status line pushes a new snapshot over WebSocket within 1 second`; `adding a new .scratch directory adds a work item`.
- `pnpm stintwork --no-open` in this repo: `/api/project` lists the `board` work item with its tickets.

## Out of scope

Any UI, writing files, incremental patches (a full snapshot is fine).

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** After installing chokidar 4.0.3 and ws 8.22.0, all checks pass (85 tests, including the three named HTTP/WebSocket checks). `pnpm stintwork --no-open` serves `/api/project` for this repo: `board` in m1, inferred implement stage, tickets 01–04 resolved, 05 unblocked, 06–08 blocked, setup fully detected, no warnings.
