# 12 — M5 exit

Status: deferred
Blocked by: 11

## What to build

Prove v0.1 on people other than the author (`docs/plan.md` M5 exit test). 3–5 developers outside the project install Stintwork and start a real task in their own repo within a minute, without help. Afterwards each says whether they'd keep using it. The maintainer recruits them; the coordinator records the results and turns defects into tickets.

## Acceptance criteria

- [ ] Each developer's result is recorded in Comments: time to first task, where they got stuck, and whether they'd keep using it.
- [ ] `.stintwork/roadmap.md`: M5 is set to `shipped` only when the exit test passes.

## Comments

**Coordinator, 2026-10-11:** Deferred by the maintainer, who will run the outside-developer test later and report back. stintwork@0.1.0 is already published to npm, so testers can start with `npx stintwork`. M5 stays `active` in the roadmap until this test passes.
