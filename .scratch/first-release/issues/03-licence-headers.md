# 03 — Licence headers

Status: resolved
Blocked by: none

## What to build

Every source file states its licence (spec user story 65; ADR 0008). Add `SPDX-License-Identifier: Apache-2.0` as the first comment in every TypeScript, JavaScript, CSS and HTML source file in the packages (not generated output, `prototype/` or `spikes/`). Add a check script that fails on a missing header, and run it in the project checks and CI.

## Acceptance criteria

- [x] Every package source file carries the header.
- [x] The check fails on a fixture file without a header and passes on the repo.
- [x] CI runs the check.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. After merging tickets 01 and 02 the check flagged their 15 new files, which the coordinator headed; the workflow bundler now writes the header into the generated file, so builds keep it. `licence:check` runs in lint (project checks) and CI and passes on 230 package source files. verify.sh passed (1404 tests).
