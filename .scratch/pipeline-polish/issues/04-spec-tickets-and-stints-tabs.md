<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Spec, Tickets and Stints tabs

Status: resolved
Blocked by: 03

## What to build

Fix spec findings A2, A3 (Stints), A4, C2 (tabs), C8, C9 and E2.

- Spec: "Contents" uses `ui/Disclosure`.
- Tickets:
  - compact rows (number · title, status chip on the same line, blockers in muted text) instead of a bordered card per ticket;
  - statuses translated through the catalog, never the raw value ("ready-for-human");
  - selecting a row still shows its body.
- Stints:
  - each Stint is one separated item with agent display name, ticket, status, relative start time and duration (`src/time.ts`, `formatDuration`), with full times in `title`;
  - "Open stint" names the Stint by its short id;
  - handoff labels and bodies share a grid and baseline;
  - checkpoint commits use short hashes with copy;
  - "No stints yet." becomes an `ui/Empty` with one sentence.
- Tool output and session-update details in Stint replays use `ui/Disclosure`.

Scope: `WorkItemDrawer.tsx` (Spec, Tickets, Stints tabs), `StintHistory.tsx`, `StintStream.tsx` (history replay), `HandoffCard.tsx`, both catalogs, and tests.

## Acceptance criteria

- [x] jsdom tests cover:
  - translated ticket statuses;
  - relative times in both languages with full times in `title`;
  - short ids and hashes;
  - the handoff grid;
  - the empty Stints state.
- [x] Browser cases at 1440 and 390px in both languages assert no visible full UUID or 40-character hash in the panel and pass the layout checks.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-25:** Delivered by Codex. The coordinator reverted a Disclosure workaround that put `role="button"` on `<summary>`, restoring native semantics. Stint history shows 8-character ids with copy; the open button's accessible name keeps the full id so screen-reader users can tell Stints apart. Checked on real data in both languages. Full checks on the merged branch: format, lint, typecheck and build pass; `pnpm test` has 3637 passing and one failure that already fails on `main` (`packages/server/src/index.test.ts`, "watching discovers project directories that do not exist at startup"), unrelated to this milestone. The full browser suite passes 555 of 556; the remaining case is `motion-board.spec.ts` "board snapshot continuity at 1440px", which saw long tasks of 58–59 ms only while three workers ran in parallel and passes run on its own (3 of 3).
