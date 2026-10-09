# M1 · The board (read-only)

Milestone: M1 · The board. See `docs/plan.md`, `GLOSSARY.md`, and ADRs 0001, 0005, 0006, 0007.

## Problem

A developer using coding agents has no single place that shows what a project is building, where each work item stands, and what blocks what. The files that hold this already exist in the repo (`.scratch/`, mattpocock's local tracker format), but they can only be read one at a time. M1 makes them visible as a board. It is also the first slice of Stintwork that Stintwork can be used on itself.

## Scope

- `npx stintwork` (and `pnpm stintwork` inside this monorepo), run in or below a git repo, starts a local server and opens the browser on the board.
- Read-only: Stintwork reads `.scratch/`, `.stintwork/` and repo-root files. It writes nothing in M1.
- Pipeline view only (ADR 0006): stage columns, cards, a milestone filter, and a work-item drawer.
- Live updates: a change to a watched file appears on the board without a reload.

### Not in M1

Stints, agents and ACP; worktrees; writing any file (including `workflow.yaml`); attention items and gates; review; GitHub; the Lists and Cockpit views; creating work items.

## Files Stintwork reads

### Work items: mattpocock's local tracker format (unchanged)

- A work item is a directory `.scratch/<slug>/`. Its title is the first `# ` heading of `spec.md`, or the slug in title case if there is no spec.
- `spec.md` is optional.
- Tickets are `.scratch/<slug>/issues/<NN>-<ticket-slug>.md`. For each ticket, read:
  - its number and slug from the filename;
  - its title from the first `# ` heading, with any leading `NN — ` or `NN - ` prefix removed;
  - `Status:` (first match near the top; the value is free text);
  - `Blocked by:` (comma-separated ticket numbers, or `none`);
  - the `## Comments` section, as blocks.
- A ticket is **resolved** when its status is `resolved`, `done` or `closed` (case-insensitive). Any other value is open.
- A ticket is **blocked** when any ticket in its `Blocked by:` list is not resolved. References to missing tickets count as blocking and produce a warning.
- `.scratch/<effort>/map.md` (wayfinder) marks a directory as a large effort. Show it as a work item with the "effort" type and no stage inference. Its child tickets are read like tickets.
- Malformed files never crash the index. They produce per-file warnings that the UI can show.

### `workflow.yaml` (Stintwork's, optional, per work item)

```yaml
workflow: feature          # feature | bug | quick
milestone: m1              # milestone id from .stintwork/roadmap.md (optional)
stage: implement           # current stage id
stages:                    # optional per-stage record (M1 reads it; later milestones write it)
  spec:
    agent: claude
    approved: { by: you, at: 2026-10-09T10:30:00Z, commit: a41c9e2 }
```

Unknown keys are ignored. An invalid file produces a warning, and the work item falls back to inference.

### Stage inference (when there is no `workflow.yaml`)

Workflow: `feature`, unless the slug starts with `bug-`, `fix-` or `b-` (then `bug`). Stage, by the first rule that matches:

| Files | Inferred stage |
|---|---|
| no `spec.md`, no tickets | Clarify (bug: Diagnose) |
| `spec.md`, no tickets | Spec |
| tickets, some not resolved | Implement (bug: Fix) |
| all tickets resolved | Review |

Inferred stages are marked as inferred in the API and on the card.

### Built-in workflows

| Workflow | Stages |
|---|---|
| Feature | clarify, spec, tickets, implement, review, ship |
| Bug | diagnose, fix, review, ship |
| Quick | do, review, ship |

On the board, Diagnose shares the Clarify column, Fix and Do share the Implement column, and Tickets is its own column.

### `.stintwork/roadmap.md` (optional)

```md
# Roadmap

## M1 · The board
Id: m1
Status: active          # planned | active | shipped
Target: 2026-10-31      # optional

- board
- some-other-work-item
```

Each `## ` heading is a milestone. Bullets are work-item slugs, in order. A work item gets its milestone from `workflow.yaml` first, then from the roadmap. Unknown slugs produce a warning.

### Setup detection (report only)

Report whether each of these exists:
- `docs/agents/issue-tracker.md`, and whether it mentions local markdown or `.scratch`
- `AGENTS.md` and/or `CLAUDE.md`
- `GLOSSARY.md`
- `docs/adr/`

Show the result as a small "Project setup" panel. Nothing is written.

## Behaviour

- **Repo discovery:** walk up from the current directory to the git root. Outside a git repo, exit with a clear message and a non-zero code.
- **Port:** prefer 4317; if it is busy, use the next free port. Print the URL. Open the browser unless `--no-open` is given.
- **Live updates:** watch `.scratch/**`, `.stintwork/**` and the setup files. Debounce, re-index, and push the new snapshot to connected browsers over WebSocket. A full snapshot is fine in M1.
- **The board shows:**
  - stage columns in workflow order;
  - one card per work item, with its id/slug, title, type, milestone, ticket progress (`resolved/total`), a **blocked** badge when every open ticket is blocked, and an **inferred** badge;
  - a milestone filter (All / each milestone);
  - a collapsed Shipped lane (items whose stage is `ship` with all tickets resolved, or milestone status `shipped`);
  - warnings as a count, with a list on click.
- **The drawer** (click a card or press Enter): the title, the stage rail, the rendered `spec.md`, tickets in dependency order with status and Blocked by, and each file's repo-relative path. Esc closes it.
- **⌘K:** jump to any work item by id or title.
- **Visual language** follows prototype variant B (`prototype/src/variants/B`): dense, quiet, keyboard-first, dark and light themes. Rebuild it; don't import prototype code.

## Acceptance criteria

1. Running `pnpm stintwork --no-open` in a fixture repo prints a URL, and `GET /api/project` returns the indexed project as JSON.
2. On a PagePilot-shaped fixture (`.scratch/contract-package/` with a spec and 6 tickets, 3 resolved), the work item shows in Implement, marked inferred, with progress 3/6, and its tickets come back in dependency order.
3. A ticket whose blockers are all resolved is not blocked. A ticket blocking on a missing number is blocked and produces a warning.
4. A `workflow.yaml` stage overrides inference. An invalid `workflow.yaml` produces a warning and falls back to inference.
5. Roadmap milestones appear in the filter, and filtering hides other milestones' cards.
6. Editing a ticket's `Status:` line to `resolved` in an editor updates the card's progress in the open browser within 1 second, without a reload.
7. A malformed ticket file (no heading, binary junk) produces a warning and does not affect the other work items.
8. Outside a git repo, the CLI exits non-zero with a message naming the problem.
9. **Dogfood:** run in this repo, the board shows `.scratch/board/` in the M1 milestone with its tickets and correct progress.
10. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` pass in CI.
