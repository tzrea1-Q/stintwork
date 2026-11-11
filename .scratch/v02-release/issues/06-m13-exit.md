# 06 — M13 exit

Status: resolved
Blocked by: 04, 05

## What to build

Check the M13 exit against the final release and public repository. Link the prerequisite milestone exits, contract results, release notes, package and publication evidence, and go-public 03 checks. Set M13 shipped in `.stintwork/roadmap.md` only after the exit passes.

## Acceptance criteria

- [x] Comments record pass or fail and links to M7 confirmations, M11 and M12 exits, and tickets 01–05 with their final evidence.
- [x] All four agent contracts pass, npm serves v0.2.0 with release notes, and the repository is public with all required public checks passing.
- [x] M13 remains planned if any exit condition fails; it is set to shipped only after a pass. The outside-developer test does not block this exit.

## Comments

**Coordinator, 2026-11-10: exit evidence; the maintainer decides.**

- **Prerequisites:** M7 confirmations in [go-public 01](../../go-public/issues/01-repo-ready-to-open.md) and [02](../../go-public/issues/02-repo-link-everywhere.md) ([M7 exit](../../go-public/issues/06-m7-exit.md)); [M11 exit](../../github-tracker/issues/08-m11-exit.md); [M12 exit](../../more-agents/issues/06-m12-exit.md). All three milestones are shipped.
- **Contract ([01](01-acp-contract.md)):** "Release contract passed" at the published revision `33125f8`. Claude Code, Codex and Antigravity CLI passed every scenario. Grok Build passed cancel; its other scenarios returned HTTP 429 (usage exhausted) and count only under the maintainer's 2026-11-10 accepted-limitation rule. They are not passes.
- **Release notes ([02](02-release-notes.md)):** `docs/release-notes/0.2.0.md` and the changelog record the publication and contract results.
- **Package ([03](03-package-checks.md)):** CI on macOS and Linux, dry run, and cold first run of 7 s and 3.9 MB, about 1.5% of the 0.1.1 baseline.
- **Publication ([04](04-publish.md)):** `stintwork@0.2.0` is `latest` on npm with the verified shasum. The registry-installed smoke passed. Tag `v0.2.0` points to `33125f8`.
- **Public repo ([05](05-go-public.md), [go-public 03](../../go-public/issues/03-make-the-repo-public.md)):** public; READMEs, links, issue forms, the security route and CI checked.

Every condition passes, with one exception: Grok's contract is an accepted limitation, not a pass. Under the maintainer's decision, the exit can count as passed. The maintainer sets M13 shipped. The outside-developer test (go-public 04) follows the release and does not block it.

**Coordinator, 2026-11-10: shipped.** The maintainer accepted the exit, including Grok's accepted contract limitation, and marked M13 shipped. At the maintainer's request, Grok Build's unverified status is recorded as an open issue in `docs/plan.md` → After the public release, tracked by [agent-polish 04](../../agent-polish/issues/04-grok-end-to-end.md).
