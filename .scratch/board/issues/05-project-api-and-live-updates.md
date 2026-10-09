# 05 — Project API and live updates

Status: ready-for-agent
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
