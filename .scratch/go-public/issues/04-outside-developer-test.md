# 04 — Outside-developer test

Status: ready-for-human
Blocked by: 03

## What to build

Run the deferred M5 exit test with 3–5 developers outside the project. This ticket replaces `.scratch/first-release/issues/12-m5-exit.md`. The maintainer chooses and recruits them. Each follows the README and starts a real task in their own repo without help. The coordinator observes and records results in Comments.

For each developer, record the version, repo and agent prerequisites. Time from following the first-run instructions to starting the first real task. Do not coach them. Record where they got stuck and ask whether they would keep using Stintwork. If help is needed, record a failed attempt. File findings as M9 tickets, then set M9's scope and size from the results.

## Acceptance criteria

- [ ] Comments record results for 3–5 outside developers: tested version, repo, prerequisites, time to first task, where they got stuck and whether they would keep using it.
- [ ] Each developer starts a real task in their own repo within a minute, without help. Failed attempts are recorded, not counted as passes.
- [ ] Each finding links to an M9 ticket, or has a recorded reason why no ticket is needed. M9 tickets use the local tracker conventions and dependency order.
- [ ] Only after the test ends, M9's scope and size are set from its findings and its work items are added to the roadmap.

## Comments

**Coordinator, 2026-10-13:** M8 · UI foundations runs now. This test waits for M8's exit because the testers' first impression is this UI. go-public 01–03 can proceed, and M7 stays active. Before starting this test, check `.scratch/ui-foundations/issues/07-m8-exit.md` and M8's shipped status in `.stintwork/roadmap.md`. `Blocked by: 03` stays unchanged: that line names tickets within this work item, not cross-work-item gates. Findings from this test set M9's scope and size.
