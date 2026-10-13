# Go public

Status: ready-for-agent

Milestone: M7 · Go public. See `docs/plan.md`, `docs/brief.md` (§12, §13, §15), `GLOSSARY.md` (Project, Work item, Ticket, Milestone, Stint, Handoff, Project memory), ADR 0005 and `.scratch/first-release/issues/12-m5-exit.md`.

## Problem Statement

Stintwork v0.1.0 and v0.1.1 are on npm, but `tzrea1-Q/stintwork` is private. Developers cannot inspect the source or report a problem there. The deferred M5 exit test has not shown whether they can start a real task in their own repo without help, or whether they would keep using it.

M6's tickets are resolved. Its exit test still needs a native speaker's review of the Chinese catalog.

## Solution

Prepare the repo, then let the maintainer open it. Link it from the READMEs and package metadata. Run the outside-developer test and turn findings into M8 tickets before setting M8's scope.

- **Prepare to open.** Bug-report and feature-idea templates, a short CONTRIBUTING and SECURITY, and a scan of tracked files and history for secrets and private paths.
- **Make the repo findable.** Both READMEs and npm metadata point to the repo. The metadata ships in the next patch release.
- **Open with confirmation.** After the preparation and links merge, the maintainer changes visibility. The coordinator checks the public repo.
- **Observe real use.** 3–5 outside developers start a real task in their own repo, without help. Record time, blockers and whether they would keep using it. File findings as M8 tickets.
- **Review Chinese alongside.** A native speaker reviews the catalog. This can finish M6, but does not block M7.

## User Stories

1. As a developer, I want to find the source from npm or either README, so that I can inspect what I install.
2. As a developer, I want to know how to report a problem or feature idea, so that the maintainer can act on it.
3. As a contributor, I want to understand the plan, tickets and agent stints, so that I can work in the project's existing process.
4. As a developer, I want to report a security problem privately, so that it is not disclosed in a public ticket.
5. As the maintainer, I want to see where outside developers get stuck, so that their findings set the next milestone's scope.
6. As a Chinese-speaking developer, I want a native speaker to review the catalog, so that its wording is natural and follows the glossary.

## Implementation Decisions

- **Repo preparation:** templates live in `.github/ISSUE_TEMPLATE/`. CONTRIBUTING describes the plan, `.scratch/` tickets, agents implementing and the coordinator verifying. SECURITY points to private reporting; the maintainer confirms the reporting route before opening.
- **Safety scan:** inspect tracked files and reachable history, not just filenames or the current tree. Record the tool, scope and result without copying secrets into Comments. Findings block opening until addressed. Rotate exposed credentials; any history rewrite needs the maintainer's confirmation.
- **Links:** `repository`, `homepage` and `bugs` in the published package's metadata point to `tzrea1-Q/stintwork`. Both READMEs link there. Publishing the next patch still needs the maintainer.
- **Visibility:** ticket 03 belongs to the maintainer and waits for 01 and 02 to merge. No agent changes visibility automatically.
- **Outside developers:** the maintainer chooses and recruits 3–5 people. Ticket 04 replaces first-release 12, which stays deferred. Results append to Comments. Findings become tickets assigned to M8; its scope and size wait until the test ends.
- **Chinese review:** ticket 05 is optional within M7. Fixes go to M8 or a ui-language follow-up ticket. M6 stays active until the review passes and its exit test is recorded.
- **M7 exit:** ticket 06 depends on 04, not 05. M7 stays active until its exit test passes.

## Testing Decisions

- **Docs checks:** `pnpm format:check`, `pnpm lint` and `pnpm vitest run packages/core`. Core checks this repo's tickets parse without warnings and stay in dependency order.
- **Public repo (coordinator):** after the maintainer opens it, check CI, both README renders and both issue templates without private-repo access. Check the private security-reporting route without publishing a vulnerability.
- **Package links:** inspect the next patch's npm metadata and both README links. Record the published version; preparing metadata alone is not publication evidence.
- **Outside-developer script:** record the tested version, repo and agent prerequisites. Start the timer when each developer follows the README's first-run instructions. Do not coach them. Record time to first real task, where they got stuck and whether they would keep using it. If help is needed, record it as a failed attempt.
- **Findings:** file actionable M8 tickets and link each result to its ticket or record why no ticket is needed. Fixing those findings belongs to M8.
- **Chinese review:** record the reviewer, catalog revision, findings and pass or fail in Comments. Check fixes before recording a pass. Keep M6 active if findings remain.
- **Exit test:** 3–5 outside developers each start a real task in their own repo within a minute, without help, and their findings are triaged into tickets. The coordinator records the result before setting M7 shipped.

## Out of Scope

- Fixing M7 findings, or setting M8's scope before the test ends.
- Stint resume, GitHub Issues as a tracker, Grok Build verification and Gemini CLI. These belong to M9–M11.
- Product changes or new workflows for contributions.
- Publishing, changing visibility or rewriting history without the maintainer's confirmation.
- Making the Chinese review a condition of M7's exit test.

## Further Notes

- v0.1.0 was published on 2026-10-11 and v0.1.1 on 2026-10-12. This work does not repeat packaging or the first-release implementation.
- M5 is marked shipped because its outside-developer test moves here. Its earlier ticket and Comments remain as the record.
- Who the outside developers are and how they are recruited remains the maintainer's call.
