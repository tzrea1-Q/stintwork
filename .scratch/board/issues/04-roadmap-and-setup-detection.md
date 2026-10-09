# 04 — Roadmap milestones and project setup detection

Status: resolved
Blocked by: 02

## What to build

In `packages/core`, per `.scratch/board/spec.md` → "`.stintwork/roadmap.md`" and "Setup detection":

- Parse `.stintwork/roadmap.md` into ordered milestones (id, name, status, target, work-item slugs). A missing roadmap means no milestones, which is not an error.
- Each work item's milestone comes from `workflow.yaml` first, then the roadmap. Unknown slugs in the roadmap produce warnings.
- A setup report: the presence of `docs/agents/issue-tracker.md` (and whether it mentions local markdown or `.scratch`), `AGENTS.md`, `CLAUDE.md`, `GLOSSARY.md` and `docs/adr/`.

## Acceptance checks

Vitest:
- `parses milestones with id, status, target and ordered slugs`
- `workflow.yaml milestone wins over the roadmap`
- `warns on roadmap slugs with no work item`
- `missing roadmap yields no milestones and no warning`
- `setup report detects tracker config, AGENTS.md, CLAUDE.md, GLOSSARY.md and ADRs`

## Out of scope

Editing the roadmap, writing setup files.

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** `format:check`, `lint`, `typecheck`, `test` and `build` pass in the worktree, including every named acceptance check.
