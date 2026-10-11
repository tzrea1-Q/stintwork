# 07 — Customise a workflow

Status: resolved
Blocked by: 01, 05

## What to build

A built-in workflow can be customised without writing YAML from scratch (spec user stories 34–38). A "Customise" action, from the workflow shown on a work item or from ⌘K, previews the built-in's YAML. After confirmation it writes the YAML to `.stintwork/workflows/<id>.yaml` and commits it as "Customise workflow <id>". It refuses if the file already exists or has uncommitted changes. New workflow ids in `.stintwork/workflows/` appear as choices in the create dialog.

## Acceptance criteria

- [x] Server tests: the copy and its commit, refusals for an existing or dirty file, and a new id offered when creating.
- [x] Component tests: the preview and confirmation, and a custom workflow in the create dialog.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. verify.sh passed (1596 tests; a first run timed out once in the unrelated review-gate scenario under machine load ~20, then passed three times alone and on a full rerun). Throwaway-repo check: preview returned the bundled Bug YAML; confirming wrote `.stintwork/workflows/bug.yaml` and committed "Customise workflow bug"; a second copy returned 409 (already exists); customising the repo's own `lean` id returned 400 (only built-ins).
