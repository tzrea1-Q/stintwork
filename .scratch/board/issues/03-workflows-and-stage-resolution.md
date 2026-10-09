# 03 — Workflows and stage resolution

Status: ready-for-agent
Blocked by: 02

## What to build

In `packages/core`: the three built-in workflows, reading `workflow.yaml`, and stage inference, per `.scratch/board/spec.md` → "`workflow.yaml`", "Stage inference" and "Built-in workflows".

- Each work item gets a resolved `workflow`, `stage`, `inferred: boolean`, and per-stage records read from `workflow.yaml` (agent, approval), carried through untouched.
- An invalid `workflow.yaml` (unparseable, unknown workflow, or a stage not in the workflow) produces a warning and falls back to inference.
- A mapping from stages to board columns: diagnose → Clarify column; fix and do → Implement column.

## Acceptance checks

Vitest:
- `infers clarify, spec, implement and review from files for a feature`
- `infers diagnose and fix for slugs starting with bug-, fix- or b-`
- `workflow.yaml stage overrides inference and is not marked inferred`
- `invalid workflow.yaml warns and falls back to inference`
- `maps diagnose, fix and do onto the shared board columns`
- `effort work items get no inferred stage`

## Out of scope

Writing `workflow.yaml` (later milestones), gates, approvals UI.
