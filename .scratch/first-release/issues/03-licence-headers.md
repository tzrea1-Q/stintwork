# 03 — Licence headers

Status: ready-for-agent
Blocked by: none

## What to build

Every source file states its licence (spec user story 65; ADR 0008). Add `SPDX-License-Identifier: Apache-2.0` as the first comment in every TypeScript, JavaScript, CSS and HTML source file in the packages (not generated output, `prototype/` or `spikes/`). Add a check script that fails on a missing header, and run it in the project checks and CI.

## Acceptance criteria

- [ ] Every package source file carries the header.
- [ ] The check fails on a fixture file without a header and passes on the repo.
- [ ] CI runs the check.
- [ ] All checks pass.
