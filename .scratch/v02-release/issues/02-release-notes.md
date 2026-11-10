# 02 — v0.2 release notes

Status: ready-for-agent
Blocked by: none

## What to build

Draft `docs/release-notes/0.2.0.md` and update the changelog from changes actually merged since `v0.1.1`. Follow the earlier release notes. Cover the Project setup fix (never replacing an existing tracker by default), Fast first run, stints surviving restarts, GitHub Issues as a tracker, more agents and UI foundations. Include upgrade guidance, evidence and known limits; check the final merged revision before publication.

## Acceptance criteria

- [ ] Notes and changelog reflect the final release revision and distinguish shipped behavior from unverified or deferred work, including agent and recovery limits.
- [ ] Notes describe the tracker setup safeguard, startup and download behavior, restart fallback, GitHub tracker boundaries, supported agents and UI changes accurately.
- [x] Links and upgrade instructions work; release date and publication claims are added only when true. Comments identify the reviewed revision and sources.

## Comments

**Codex, 2026-11-09:** Drafted notes and an Unreleased changelog entry against `v0.1.1..db6e79e08d188ffb3a488d3a906c33fa9d9a0ac2` (tag resolves to `fb5645a3477fdb567afa45dd6a111bfd781a1f61`), reviewing first-parent merged history, the roadmap, v0.2 plan, ADRs 0010–0018, and the cited M8–M11 exit tickets, setup ticket 10, M12 tickets and Grok ticket 04. The roadmap records M8–M10 shipped; M11's retest and outstanding cleanup/verdict, M12's unimplemented Antigravity support and real-agent exits, and M7 confirmations are identified as pending. No release date or publication is claimed. The version-specific upgrade command is for use after publication; local relative link targets were checked. Final release revision, M11/M12 outcomes, M7 confirmations, package publication and release-wide ACP contract evidence must be rechecked by the coordinator. Therefore the first two criteria remain unchecked: they require the final release revision and any changes merged before it. No commit was made.

Checks: `pnpm format:check` passed (434 files); `git diff --check` passed; all local Markdown link targets in the draft notes and changelog exist. Publication and the post-publication npm command were not tested.

**Codex, 2026-11-10:** Updated the draft and Unreleased changelog against `v0.1.1..41185163cdf3a1a5f9d49cd1b5183c234398548c` (local `main` at that revision). Reviewed the git log, roadmap and plan, M11 exit and follow-up, M12 agent tickets and exit, agent-polish 04, agent profiles, M7 exit and security/metadata tickets, and M13 contract ticket and instructions. M7, M11 and M12 are shipped; Grok real-stint verification and Antigravity native restart remain deferred. The contract results remain a placeholder; the requested Grok limitation policy is identified as a pending parallel contract change because the current contract document still blocks always-approve Ask. Final release revision, contract evidence, publication and public-link checks remain for the coordinator. Status and criteria are unchanged. No commit was made.

Checks: `pnpm format:check`, `git diff --check`, and local Markdown link target checks passed.
