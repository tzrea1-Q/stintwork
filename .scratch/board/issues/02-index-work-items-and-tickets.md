# 02 — Index work items and tickets from .scratch/

Status: ready-for-agent
Blocked by: 01

## What to build

In `packages/core`, a pure function from a set of repo files to a project index: work items, specs, tickets and warnings, following `.scratch/board/spec.md` → "Work items". Core takes file contents through a small read-only filesystem port, so tests run on in-memory fixtures.

- Work item: slug, title (from the spec heading or the slug), type (`effort` when `map.md` is present), spec path and text, tickets.
- Ticket: number, slug, title (with the `NN — ` prefix removed), raw status, resolved flag, `blockedBy`, a computed blocked flag, comment blocks, and path.
- Tickets ordered by dependency (topological order, ties broken by number). Cycles produce a warning and fall back to numeric order.
- Warnings: malformed files, a missing referenced ticket, a dependency cycle. A bad file never throws.

Use `GLOSSARY.md` terms in type names (`WorkItem`, `Ticket`, not `Issue` or `Task`).

## Acceptance checks

Vitest, with in-memory fixtures (one of them a copy of the PagePilot-shaped contract-package layout: spec plus 6 tickets with the real Blocked by graph):
- `indexes a work item with spec and tickets`
- `orders tickets by dependency then number`
- `treats resolved, done and closed as resolved, case-insensitively`
- `marks a ticket blocked until all its blockers are resolved`
- `warns on a Blocked by reference to a missing ticket and treats it as blocking`
- `warns on a dependency cycle and falls back to numeric order`
- `a malformed ticket produces a warning without affecting other work items`
- `a directory with map.md is an effort`

## Out of scope

Stages, workflows, milestones, setup detection, I/O.
