# 01 — Workflows as YAML

Status: ready-for-agent
Blocked by: none

## What to build

The built-in Feature, Bug and Quick task workflows move from code into YAML files bundled with Stintwork (spec user stories 33, 37, 39–41). Each stage gets a `gate` kind (`manual`, `spec`, `tickets`, `evidence` or `merge`) alongside its id, name, column, skill and optional agent. A workflow file in the project's `.stintwork/workflows/` replaces the built-in with the same id or adds a new workflow. Core validates unique stage ids, known columns and gate kinds, and that the last stage is a `merge` gate in the Ship column. An invalid file shows a warning on the board, and work items on it fall back to the built-in with that id (or Feature). The workflow id becomes an open string validated against the loaded set. For work items on the built-ins, the board, gates and briefs behave exactly as before.

## Acceptance criteria

- [ ] Core tests: loading built-ins from YAML, overriding by id, adding a new id, and each validation failure falling back with a warning.
- [ ] Server test: a repo workflow file changes a work item's stages on the board, and an invalid one produces a warning without hiding the work item.
- [ ] Existing workflow, gate and stage tests pass unchanged.
- [ ] All checks pass.
