# 07 — Verify the integrated flow and prepare the exit

Status: resolved
Blocked by: 06

## What to build

Exercise the full fixture-backed flow and write a concise coordinator runbook in this ticket's Comments for a maintainer-selected real repo. Include setup, issue identity, read counts/latency, evidence revalidation, failure recovery and safe cleanup; do not perform live writes here.

## Acceptance criteria

- [x] Fake-gh integration covers discovery through ticket stint, approval and refresh including a remote edit and a failed relation page, without network.
- [x] Runbook names required access, a parent with direct same-repository sub-issues or the label, and a direct same-repository ticket, checks, issue and PR permissions, cleanup and expected evidence.
- [x] Record actual automated/build and browser results, commands, revision and limits; distinguish fake gh from real GitHub.
- [x] Coordinator-only real gh, network, local sockets and browser checks are identified and no real-repo pass is claimed.

## Comments

**Coordinator, 2026-10-31:** The CI evidence that was pending is now in place. After billing was restored, main CI runs 41270288999 (`db7e61f`) and 41270497461 (`eb0e3e1`) passed. Both contain this ticket's merge `fc3b50d`.

**Coordinator, 2026-10-28:** Resolved. Merged to main as `fc3b50d`.

The full local verify passed on the merged tree: format:check, lint, typecheck, build, 3,144 unit tests across 171 files, smoke:package and test:e2e. There were 2 Codex review rounds; the last was clean. The round-1 fix: one shared Tickets dependency rule (ordered siblings; closed external blockers; cycles and unknown dependencies refuse).

CI run 40815958375 did not run any job. GitHub reported that recent account payments failed or the spending limit must be raised. CI evidence for this merge is pending until the maintainer resolves billing and the run is re-run.

All automated evidence here uses fake gh. No real-repo pass has been run; that is ticket 08.

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-28:** Coordinator runbook for ticket 08 (no real-repo pass has been run):

1. With the maintainer, select and authorize a repository and cleanup. The coordinator needs an existing authenticated github.com `gh` login and issue/PR write and merge permissions. Never inspect or record credentials. Prepare a top-level parent with a spec body and direct same-repository sub-issues, or the `stintwork:work-item` label, and at least one direct same-repository ticket that is small and safe to implement.
2. Build the revision to be tested and record its commit SHA and build result. Configure the project for GitHub tracker detection and verify that `origin` identifies the selected repository. The following live steps are coordinator-only and require real `gh` and network; running the local server also requires local sockets, and visual review requires a browser.
3. Discover the board and record request count, actual GraphQL cost and latency from snapshot `pages`; open the parent and record detail latency. Verify parent and ticket identities and dependency ordering. Review and approve the required gates, start a real agent stint for the ticket, and verify its brief. The agent updates the issue via its own tracker skill and `gh`. Run project checks, create the PR, verify all required checks on its current head, and merge with the authorized permissions.
4. Revalidate evidence by a remote edit and refresh, or use a separately authorized disposable issue; observe approval invalidation and reapproval. Safely simulate a failure such as offline access or revoked access and verify read-only retained data, blocked actions and successful recovery.
5. Record repository, issue and PR URLs and node IDs, tested and merged commits, check outcomes, request counts, costs and timings, failure/recovery observations, and screenshots at 1440 and 390 widths. Do not copy private issue content. With maintainer approval close or delete only resources created for the exit; remove exit worktrees and branches and stop servers. The maintainer alone accepts the full pass and marks M11 shipped.

Automated checks on base revision `17fcd9cba06d4c8a0dfe80b2ad019aa02ad2b7e9` plus the uncommitted ticket changes: `pnpm format`, `pnpm format:check`, `pnpm lint` (passed with 8 existing warnings), `pnpm typecheck`, and `pnpm vitest run packages/server/src/github-flow.test.ts` passed. The existing `github-gates.test.ts` and `gate-output.test.ts` also passed (78 tests). These use fake gh; no production build or browser test was run, and no real GitHub, live network or socket exit was run. The integration permits known, ordered internal blockers at the Tickets gate; closing #11 itself invalidates ticket evidence, so the test reapproves before separately verifying a body edit invalidation.

**Codex, 2026-10-28:** Unified GitHub Tickets gate readiness and fresh approval validation for ordered sibling dependencies, closed external blockers, cycles and unknown dependencies. On `6de5e37` plus these uncommitted changes, `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), `pnpm typecheck`, and `pnpm vitest run packages/core/src/gate-output.test.ts packages/server/src/github-gates.test.ts packages/server/src/github-flow.test.ts packages/server/src/github-stints.test.ts` passed (136 tests). Tests use fake gh; no live GitHub or browser exit was run.
