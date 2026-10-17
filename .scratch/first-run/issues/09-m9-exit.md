# 09 — M9 exit

Status: ready-for-human
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08

## What to build

Record M9's exit test after tickets 01–08 are resolved and the installation decision is approved. Do not run the exit on the spike alone.

With an isolated empty npm cache, run `npx stintwork@latest` or the packed tarball in a real repo on a typical home connection. Measure through the board becoming usable. It must show within 60 seconds and download a small fraction of today's baseline, using the spike's concrete size limit and any tighter time limit. Record the version or tarball revision, OS and architecture, connection conditions, cache state, elapsed time, downloaded bytes and baseline comparison. Do not clear the developer's normal cache.

Start real stints using the developer's existing login, verifying compatible installed CLIs and selected-agent pinned bundled fallback when an installed version is missing, incompatible or unverified. Record agent/adapter versions, installed or bundled source, the selection reason, first-use progress/downloads and whether each stint starts. Bundled preparation is allowed only at that agent's first use, never board startup or availability refresh. Record missing agents, blocked checks and failures rather than counting them as passes. Use tickets 06/07 and the spike's cache, offline and failure verification plan.

Set M9 shipped in `.stintwork/roadmap.md` only when the full exit passes. Otherwise leave it active with blockers recorded. No outside-developer test is required.

## Acceptance criteria

- [ ] Tickets 01–08 are resolved, the approved decision record is linked and the adapter/native/dependency-closure pinned-version guarantee is verified.
- [ ] Comments record a cold-install result with the board usable within 60 seconds or the spike's tighter limit, and the measured download within its concrete small-fraction budget. Version or revision, environment, connection, empty-cache evidence and a comparable baseline are included.
- [ ] Comments record real stints under the developer's own login, installed-compatible and bundled-fallback paths, versions, source/reason and separate first-use downloads/progress; no preparation occurred during board/availability checks. Missing or blocked checks are not passes.
- [ ] Cache, offline and failed-install checks required by the chosen approach are recorded with actual results.
- [ ] Comments record the overall pass or fail. M9 is set to `shipped` only when all exit conditions pass; otherwise it stays active with blockers recorded.

## Comments

**Codex, 2026-10-17:** Renumbered the existing exit ticket from 02 to 08 after filing proposals A–F as tickets 02–07; expanded blockers to 01–07 and retained `Status: ready-for-human`. Exit evidence now includes the approved selected-agent bundled fallback under the developer's existing login, with no board/availability preparation. No exit was run or M9 status changed.

**Codex, 2026-10-17:** Renumbered the exit to 09 and added 08 as a blocker for the coordinator’s real-stint defects. Exit Status and M9 remain unchanged; this is not exit evidence.
