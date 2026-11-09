# v0.2 release and going public

Status: ready-for-agent

Milestone: M13 · v0.2 release and going public

See `docs/plan.md` (v0.2 and M13), `GLOSSARY.md`, ADRs 0002, 0011, 0013, 0017 and 0018, and the `first-release`, `go-public` and `more-agents` work items.

## Problem Statement

v0.1.1 is on npm and the repository is private. v0.2 needs release evidence for the changes since then, a verified package and a deliberate public opening.

## Solution

Turn the ACP probe into a manually run contract test, prepare notes and the package from the merged release revision, publish with the maintainer's explicit confirmation, then have the maintainer make the repository public. Record evidence and limitations at each ticket; do not infer a pass from a fake agent, a dry run or old release evidence.

## Implementation Decisions

- Release work waits for the M11 and M12 exits and M7's maintainer confirmations: `go-public` 01 and 02 resolved and its 06 exit recorded. M11 must pass its real GitHub-tracked work item exit; M12 must pass its real Grok Build and Antigravity CLI stints and parsed handoffs. M12's maintainer marks it shipped. Check the roadmap and exit evidence before starting release work; the ticket blockers below are only within this work item.
- Ticket 01 defines and runs the real-agent ACP contract against Claude Code, Codex, Grok Build and Antigravity CLI. Use the shipped Agent sources, pins, permission mapping and recovery behavior; record capability-specific pass rules and evidence. The maintainer supplies the agents' own logins when needed. Never handle credentials.
- Ticket 02 drafts release notes from the actual merged changes since `v0.1.1`, including the Project setup fix, Fast first run, restart recovery, GitHub Issues, more agents and UI foundations. Distinguish verified behavior from limits and pending work.
- Ticket 03 prepares version 0.2.0, package checks and the existing CI and npm release procedure's dry run. There is no separate publish workflow in this repository. Test the same release revision and packed artifact intended for publication, including macOS and Linux and M9's cold-cache budget.
- Ticket 04 publishes only after explicit maintainer confirmation for v0.2.0. Ticket 05 follows `go-public` 03: the maintainer changes visibility; the coordinator checks the public repository. These are separate decisions.
- Ticket 06 records the M13 exit and changes M13 to shipped only after all evidence passes. Keep M13 planned until then.

## Testing Decisions

Record revision, commands, environment, results and links or safe evidence locations in ticket Comments. Contract failures, missing authentication, untested required capabilities, package failures or unresolved public checks block the relevant ticket and exit. Do not publish sensitive probe transcripts. A release candidate changed after validation must be rechecked at its final revision.

## Out of Scope

The outside-developer test and its follow-up fixes are after the public release, outside v0.2. No automatic publication, visibility change, login or credential handling. The M11 rule allowing M12 to move to v0.3 if M11 runs long remains a plan-level decision; this work item assumes M12 is included and does not silently waive its exit.

## Acceptance Criteria

- [ ] M7 confirmations and M11 and M12 exits are recorded before release work.
- [ ] The documented ACP contract passes against all four supported agents at the release revision.
- [ ] Accurate v0.2 notes and a verified package are ready; the maintainer explicitly confirms publication and npm serves v0.2.0.
- [ ] The maintainer makes the repository public; CI, both README renders and links, issue templates and SECURITY's private reporting route pass the public checks.
- [ ] M13's exit evidence is recorded before the roadmap is set to shipped.
