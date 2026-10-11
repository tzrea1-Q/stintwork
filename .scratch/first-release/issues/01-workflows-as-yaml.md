# 01 — Workflows as YAML

Status: resolved
Blocked by: none

## What to build

The built-in Feature, Bug and Quick task workflows move from code into YAML files bundled with Stintwork (spec user stories 33, 37, 39–41). Each stage gets a `gate` kind (`manual`, `spec`, `tickets`, `evidence` or `merge`) alongside its id, name, column, skill and optional agent. A workflow file in the project's `.stintwork/workflows/` replaces the built-in with the same id or adds a new workflow. Core validates unique stage ids, known columns and gate kinds, and that the last stage is a `merge` gate in the Ship column. An invalid file shows a warning on the board, and work items on it fall back to the built-in with that id (or Feature). The workflow id becomes an open string validated against the loaded set. For work items on the built-ins, the board, gates and briefs behave exactly as before.

## Acceptance criteria

- [x] Core tests: loading built-ins from YAML, overriding by id, adding a new id, and each validation failure falling back with a warning.
- [x] Server test: a repo workflow file changes a work item's stages on the board, and an invalid one produces a warning without hiding the work item.
- [x] Existing workflow, gate and stage tests pass unchanged.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex; the coordinator removed a doubled "Error:" prefix from the invalid-workflow warning. verify.sh passed (1296 tests). Throwaway-repo check: a project workflow `.stintwork/workflows/lean.yaml` (Build → Review → Ship) put work item `beta` (workflow: lean, stage: build) in the Implement column; `alpha` with no workflow.yaml stayed on the built-in Feature at Spec; an invalid `broken.yaml` produced one warning naming the file and the fallback, without hiding any work item.
