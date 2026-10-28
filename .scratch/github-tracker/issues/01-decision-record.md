# 01 — Record the GitHub tracker decision

Status: resolved
Blocked by: none

## What to build

Review proposed `docs/adr/0013-github-issues-tracker.md` against the spec, spike and all ADRs. The maintainer decides before implementation starts. On approval only, record the approval in 0013 and mark 0005 superseded with a link; otherwise retain both records and record the outcome. This filing has already written the proposal and does not claim approval.

## Acceptance criteria

- [x] The proposed record states remote spec/tickets, read-only Stintwork and worktree-local committed workflow evidence.
- [x] It supersedes 0005 only upon approval and explicitly narrows 0001, including offline and bare-clone limits; 0006 and 0009 remain applicable.
- [x] The maintainer decision and actual documentation checks are recorded here; implementation waits for approval.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. The proposed ADR is written; maintainer approval remains pending. No product code or existing ADR was changed.

**Codex, 2026-10-27:** Documentation filing checks passed: `pnpm --config.verify-deps-before-run=false format:check`, `pnpm --config.verify-deps-before-run=false lint` (one existing Biome deprecation notice), and `pnpm --config.verify-deps-before-run=false vitest run packages/core --configLoader native` (33 files, 979 tests). `git diff --check` passed. These do not establish a real GitHub or M11 exit pass.

**Coordinator, 2026-10-27:** The maintainer approved ADR 0013. ADR 0005 is marked superseded, and the maintainer also chose discovery by direct same-repository sub-issue or label. Implementation may proceed.
