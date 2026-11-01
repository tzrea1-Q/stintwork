# 09 — Detect local gate HEAD races

Status: resolved
Blocked by: 04

## What to build

Detect when a local gate approval commit has a different parent from the reviewed HEAD. Share the GitHub approval history check and project stale local approvals without changing their workflow records.

## Acceptance criteria

- [x] Local approval responses and snapshots report `head-changed` when HEAD advances during the gate commit, in both the checkout and a worktree.
- [x] Normal approvals and workflow YAML bytes remain unchanged; later unrelated commits do not make an approval stale.
- [x] The shared history check follows checkout fallback and rechecks uncommitted records, caching results only after finding their introducing commit.
- [x] GitHub gate and snapshot behavior remains unchanged, and the specified gate, history and workflow-write tests pass.

## Comments

**Coordinator, 2026-10-29:** Resolved. Codex (gpt-6.1-terra) implemented it in three rounds; `codex review --base main` found five real history-check defects across two rounds (cache surviving history rewrites, checkout fallback dropping a worktree result, one failing record hiding the others, an uncommitted worktree copy skipping the checkout, and a GitHub root-commit approval turning `current` instead of `unknown`), all fixed with regression tests. Verified after merging main (ticket 10): format:check, lint, typecheck, build, full Vitest (3,176 tests), package smoke and Playwright e2e (376). A projection over this repo's own local approvals marked none stale (2 approvals; about 120 ms uncached, 34 ms cached). `github-flow.test.ts` once timed out at 120 s under load during a full run; run alone it takes 66 s on this branch and about 95 s on main code, so this is not a regression.

Not covered here (left as follow-ups): the web gate view still ignores a local `approval: "stale"` response and the projected local `state`, so a stale local approval does not show in the UI; a stale local approval does not block later gates (local readiness is unchanged); and a hand-written approval committed later outside the gate route does not trigger a snapshot refresh, because the watcher does not track checkout branch refs. GitHub gates share that watcher limitation.


**Coordinator, 2026-10-31:** GitHub CI green on main `8b130f1`, which contains this ticket (run 40892196500, rerun after the account billing block was lifted): checks, browser (1) and (2), and package-smoke on ubuntu and macOS all passed.
