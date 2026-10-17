# Ready to go public

Status: ready-for-agent

Milestone: M7 · Ready to go public. See `docs/plan.md`, `docs/brief.md` (§12, §13, §15), `GLOSSARY.md` (Project, Work item, Ticket, Milestone, Stint, Handoff, Project memory) and ADR 0005.

## Problem Statement

Stintwork v0.1.0 and v0.1.1 are on npm, but `tzrea1-Q/stintwork` is private. The repo needs reporting routes, contribution guidance and links ready before the public release. The project is not mature enough for outside developers yet.

Tickets 01 and 02 are built and merged. The maintainer still needs to confirm the SECURITY route and support policy, and the handling of repo links while the repo is private. Ticket 05 is resolved; M6 shipped.

## Solution

Prepare the repo and its links. Keep it private until M13 releases v0.2 and goes public. M7 ends with the maintainer's confirmations, not a visibility change or an outside-developer test.

- **Prepare to open.** Bug-report and feature-idea templates, a short CONTRIBUTING and SECURITY, and a scan of tracked files and history for secrets and private paths.
- **Make the repo findable.** Both READMEs and npm metadata point to the repo. Any patch published before M13 carries the metadata; the links become live once the repo is public.

## User Stories

1. As a developer, I want to find the source from npm or either README, so that I can inspect what I install once the repo is public.
2. As a developer, I want to know how to report a problem or feature idea, so that the maintainer can act on it.
3. As a contributor, I want to understand the plan, tickets and agent stints, so that I can work in the project's existing process.
4. As a developer, I want to report a security problem privately, so that it is not disclosed in a public ticket.
5. As the maintainer, I want the reporting route and support policy agreed before release, so that opening the repo does not leave them undecided.

## Implementation Decisions

- **Repo preparation:** templates live in `.github/ISSUE_TEMPLATE/`. CONTRIBUTING describes the plan, `.scratch/` tickets, agents implementing and the coordinator verifying. SECURITY points to private reporting; the maintainer confirms the route and latest-published-version support policy.
- **Safety scan:** inspect tracked files and reachable history, not just filenames or the current tree. Record the tool, scope and result without copying secrets into Comments. Findings block opening until addressed. Rotate exposed credentials; any history rewrite needs the maintainer's confirmation.
- **Links:** `repository`, `homepage` and `bugs` in the package metadata point to `tzrea1-Q/stintwork`. Both READMEs link there. The maintainer confirms that these links return 404 until M13 and that any patch published before M13 carries them. Publishing still needs the maintainer.
- **Visibility:** ticket 03 is deferred to M13. No agent changes visibility automatically.
- **Outside developers:** ticket 04 and first-release 12 stay deferred until after the public release, outside v0.2. Feedback sets later scope, not M9's.
- **M7 exit:** ticket 06 depends on 01 and 02. Resolve them after the maintainer's confirmations. M7 stays active until its exit test passes; ticket 05 does not block it.

## Testing Decisions

- **Docs checks:** `pnpm format:check`, `pnpm lint` and `pnpm vitest run packages/core`. Core checks this repo's tickets parse without warnings and stay in dependency order.
- **Preparation:** retain 01's scan evidence and 02's packed-metadata evidence. Record the maintainer's confirmations in Comments; do not treat prepared metadata as proof of publication or live links.
- **Public repo:** ticket 03's CI, README, issue-template and private-reporting checks happen in M13, not at M7's exit.
- **Exit test:** 01 and 02 are resolved after the maintainer's confirmation. Ticket 06 records the result before setting M7 shipped.

## Out of Scope

- Making the repo public or checking it as a public repo. These belong to M13.
- The outside-developer test and fixes from its findings. Revisit them after the public release, outside v0.2.
- Stint resume, GitHub Issues as a tracker, Grok Build verification and Gemini CLI. These belong to M10–M12.
- Product changes or new workflows for contributions.
- Publishing, changing visibility or rewriting history without the maintainer's confirmation.
- Making the Chinese review a condition of M7's exit test.

## Further Notes

- v0.1.0 was published on 2026-10-11 and v0.1.1 on 2026-10-12. This work does not repeat packaging or the first-release implementation.
- **Changed 2026-10-17:** M7 originally included opening the repo, the deferred M5 test with 3–5 outside developers and triage into a feedback-driven M9. The maintainer decided the project is not mature enough for outside developers yet. M7 now covers preparation only. Opening moves to M13; the test and fixes follow the public release and do not gate v0.2. M9 is now Fast first run. Earlier ticket Comments remain as the record.
