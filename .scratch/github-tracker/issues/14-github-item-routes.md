# 14 — Resolve GitHub work items in server routes

Status: ready-for-agent
Blocked by: 13

## What to build

The real-repository exit found that accepting a memory proposal for a GitHub work item returns "Work item not found". Audit server routes that index only local Markdown and use the current GitHub-aware project snapshot consistently. Preserve local behavior and route GitHub gates through their existing routes.

Use the identity-bound GitHub workflow record for stage and workflow writes, and require current remote identity and evidence for Ship actions that depend on GitHub approvals. Preserve existing write safeguards.

## Acceptance criteria

- [ ] Memory proposals, stage-agent choice, diff, checks, finding decisions, Ship, roadmap and stint finalisation and recovery resolve GitHub items.
- [ ] GitHub workflow writes use the identity-bound record and remote-dependent actions fail closed on stale or unavailable evidence.
- [ ] Fake-gh route tests cover the GitHub paths and local route tests remain passing.
- [ ] The indexProject and workflow-path call sites are audited and requested checks are recorded.

## Comments

**Codex, 2026-11-01:** Partial implementation. Memory proposal decisions use the live GitHub-aware snapshot, and review writes can create a missing per-item review directory. This is not yet verified with fake GitHub data and the ticket remains open.

Audit of non-test `indexProject` call sites: `brief-preview.ts` has the existing GitHub-specific projection; `create-work-item.ts` refuses a GitHub tracker before indexing; `memory-proposals.ts` now uses the GitHub snapshot for GitHub trackers. `checks.ts`, `finding-decisions.ts`, `stage-agent.ts`, `ship.ts` (all three calls), `roadmap.ts`, `work-item-diff.ts`, and the recovery calls in `stints.ts` still need the shared resolver. The stage-changed check in `stints.ts` already uses the GitHub snapshot for GitHub items. `gates.ts` still needs an explicit GitHub refusal. `index.ts` builds the live projection. Ship and review send-back workflow paths and remote evidence checks still need work; the `.scratch` path audit is not complete.

Checks run: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 warnings), `pnpm typecheck`, and `pnpm vitest run packages/git/src/review.test.ts packages/server/src/memory-proposals.test.ts` (14 passed). No socket failures occurred in these checks. The requested new fake-gh route test has not been written.

**Codex, 2026-11-01:** Stage B: extracted the GitHub-aware snapshot resolver and applied it to memory proposals, checks, finding decisions, stage-agent choice, roadmap assignment and work-item diff; local trackers still index the current project files. The local gate routes now refuse GitHub slugs and point to the GitHub gate routes. Stage-agent writes use the identity-bound GitHub workflow and existing protected writer. Review decisions remain under `.scratch/<slug>/review.yaml`, as in the review writer; Review send-back reads the identity-bound GitHub workflow and commits it atomically with the review record. Fake-gh route coverage exercises these paths, including acceptance and rejection of memory proposals.

Call-site audit: `brief-preview.ts` retains its GitHub projection; `create-work-item.ts` refuses GitHub trackers; `index.ts` builds the live snapshot; the stage-changed check in `stints.ts` already uses it. `ship.ts` (three calls), stint recovery calls in `stints.ts`, and Ship workflow/evidence handling remain Stage C work. This comment does not mark the ticket complete.

Checks: `pnpm format`, `pnpm format:check`, `pnpm lint` (8 existing warnings), and `pnpm typecheck` passed. The requested Vitest command passed 109 tests; its sole failure was `checks.test.ts` WebSocket streaming, where the sandbox rejected `listen 127.0.0.1` with `EPERM`. The new GitHub route test passed all 4 cases separately as well; `pnpm vitest run packages/git/src/review.test.ts` passed all 8 tests.
