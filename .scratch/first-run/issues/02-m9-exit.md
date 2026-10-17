# 02 — M9 exit

Status: ready-for-human
Blocked by: 01

## What to build

Record M9's exit test after the spike and implementation. This ticket initially waits on 01 only. When the coordinator files implementation tickets, insert them before this exit ticket in dependency order and add their IDs to its `Blocked by` line. Do not run the exit on the spike alone.

With an isolated empty npm cache, run `npx stintwork@latest` or the packed tarball in a real repo on a typical home connection. Measure through the board becoming usable. It must show within 60 seconds and download a small fraction of today's baseline, using the spike's concrete size limit and any tighter time limit. Record the version or tarball revision, OS and architecture, connection conditions, cache state, elapsed time, downloaded bytes and baseline comparison. Do not clear the developer's normal cache.

Start a real stint with each installed agent using the developer's existing login. Record the agent and pinned adapter versions and whether the stint starts. Record missing agents, blocked checks and failures rather than counting them as passes. Use the spike's verification plan for cache, offline and failure handling if installation changed.

Set M9 shipped in `.stintwork/roadmap.md` only when the full exit passes. Otherwise leave it active with blockers recorded. No outside-developer test is required.

## Acceptance criteria

- [ ] Implementation tickets have been inserted before this exit ticket, added to its blockers and resolved. If installation changed, the new decision record is linked and the pinned-version guarantee is verified.
- [ ] Comments record a cold-install result with the board usable within 60 seconds or the spike's tighter limit, and the measured download within its concrete small-fraction budget. Version or revision, environment, connection, empty-cache evidence and a comparable baseline are included.
- [ ] Comments record a real stint starting with each installed agent, under the developer's own login, with agent and adapter versions. Missing or blocked checks and failures are explicit, not reported as passes.
- [ ] Cache, offline and failed-install checks required by the chosen approach are recorded with actual results.
- [ ] Comments record the overall pass or fail. M9 is set to `shipped` only when all exit conditions pass; otherwise it stays active with blockers recorded.

## Comments
