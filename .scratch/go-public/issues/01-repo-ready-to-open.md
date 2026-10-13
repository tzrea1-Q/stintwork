# 01 — Repo ready to open

Status: ready-for-agent
Blocked by: none

## What to build

Prepare `tzrea1-Q/stintwork` for public use. Add bug-report and feature-idea templates in `.github/ISSUE_TEMPLATE/`, a short CONTRIBUTING.md and SECURITY.md. CONTRIBUTING explains the plan, tickets in `.scratch/`, agents implementing and the coordinator verifying, and how to report a problem. SECURITY points to a private reporting route confirmed by the maintainer.

Scan tracked files and reachable Git history for secrets and private paths before opening. Record the scan's scope and result, not secret values. Findings block opening until addressed. Exposed credentials need rotation; any history rewrite needs the maintainer's confirmation. This ticket does not change repo visibility.

## Acceptance criteria

- [ ] Both issue templates ask for enough information to triage a report or idea.
- [ ] CONTRIBUTING explains the existing build process and how to report a problem in plain, short sentences.
- [ ] SECURITY points to a private reporting route confirmed by the maintainer.
- [ ] Comments record the scan tool, tracked-file and history scope, findings and disposition. No unresolved secrets or private paths remain in that scope.
- [ ] Preparation is merged before ticket 03. Visibility stays private until the maintainer changes it.

## Comments
