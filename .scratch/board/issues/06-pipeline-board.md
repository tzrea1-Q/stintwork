# 06 — The Pipeline board

Status: ready-for-agent
Blocked by: 05

## What to build

In `packages/web`: the board, per `.scratch/board/spec.md` → "The board shows". Visual reference is `prototype/src/variants/B/` and `prototype/PROTOTYPE.md` → "Visual language". Rebuild it; don't import prototype code.

- Subscribe to `/api/live`, falling back to `GET /api/project`.
- Top bar: project name and branch, milestone filter (All plus each milestone), warnings count (click for the list), and a setup indicator (click for the setup report).
- Columns in order: Clarify, Spec, Tickets, Implement, Review, Ship, plus a collapsed Shipped lane.
- Cards: id/slug, title, type icon, milestone, ticket progress (`resolved/total`), a blocked badge (every open ticket blocked), an inferred badge with a tooltip explaining the inference.
- Empty states for columns and for a repo without `.scratch/`. Dark and light themes from CSS tokens. Usable at 1280×800.

## Acceptance checks

- Component tests (Vitest + Testing Library): `renders cards in the column of their stage`; `milestone filter hides other milestones`; `shows blocked and inferred badges`; `shows an empty state for a repo without .scratch`.
- Manually, in this repo: the `board` card appears under its stage in M1, and its progress matches the ticket files.

## Out of scope

The drawer, ⌘K, any write actions, agents.
