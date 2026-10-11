# 07 — Customise a workflow

Status: ready-for-agent
Blocked by: 01, 05

## What to build

A built-in workflow can be customised without writing YAML from scratch (spec user stories 34–38). A "Customise" action, from the workflow shown on a work item or from ⌘K, previews the built-in's YAML. After confirmation it writes the YAML to `.stintwork/workflows/<id>.yaml` and commits it as "Customise workflow <id>". It refuses if the file already exists or has uncommitted changes. New workflow ids in `.stintwork/workflows/` appear as choices in the create dialog.

## Acceptance criteria

- [ ] Server tests: the copy and its commit, refusals for an existing or dirty file, and a new id offered when creating.
- [ ] Component tests: the preview and confirmation, and a custom workflow in the create dialog.
- [ ] All checks pass.
