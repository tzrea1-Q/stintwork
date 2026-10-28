# 03 — Read tickets and blockers

Status: ready-for-agent
Blocked by: 02

## What to build

Add on-demand complete direct-sub-issue, comment and dependency reads to the shared project model. Implement status mapping, native/text precedence and safe ordering exactly as the spec. Use fixtures and fake `gh`; no network.

## Acceptance criteria

- [x] Direct same-repo children, unsupported nested/cross-repo relationships and all required pages have the specified completeness states.
- [x] Status mapping covers closure reasons, configured and conflicting triage roles and active stints; assignment alone does not start work.
- [x] Native and text blockers, missing or inaccessible references, closed-not-planned blockers and cycles obey the specified precedence and never expose unknown as unblocked.
- [x] Topological ordering and issue-number ties are deterministic; capped or failed relations block dependent actions.
- [x] Fake-gh tests exercise multi-page and failure cases without network.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-27:** Implemented an on-demand, read-only GitHub work-item refresh seam and shared snapshot data for the parent body, direct tickets, comments, statuses and blockers. The reader verifies viewer, origin, repository and issue identities; paginates children, labels, comments and native blockers; rejects duplicate, incomplete and capped connections; retains same-viewer stale data as unknown/blocked; and honors rate-limit reset times. Native blockers take precedence over text, external references are resolved in the same repository, and ticket ordering reuses the local dependency order. Recorded sanitized gh-aw and spec-kit data and synthetic fake-gh responses cover closure, native and text edges, conflicting roles, cycles, missing and cross-repository references, multi-page results, failures, caps, retries and identity changes. GitHub ticket starts and approvals remain unavailable until tickets 04 and 05 implement their fresh-read and evidence checks; ticket 06 owns work-item-view refresh and presentation.

Checks: 1,620 web/core tests passed; 62 focused server tests passed (60 discovery and 2 ticket API tests), with the ticket test rerun after subsequent changes. Format, lint and typecheck passed; lint reported the existing Biome deprecation. Workspace dependencies point to the original checkout, so tests and an additional server typecheck used temporary source aliases. No network or GitHub writes were used. The coordinator must run the full server suite and the real-repository M11/browser exit outside this socket-restricted sandbox.
