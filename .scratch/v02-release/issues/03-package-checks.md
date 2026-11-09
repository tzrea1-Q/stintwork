# 03 — Package and release dry run

Status: ready-for-agent
Blocked by: 01, 02

## What to build

Prepare the 0.2.0 version and package from the release candidate. Run the repository's full checks and packed-tarball smoke on macOS and Linux, locally or in CI. Exercise the existing CI and manual npm release procedure with `npm publish --dry-run`; inspect the packed files, metadata and version. Measure a cold-cache first run using the M9 method and budget. Do not publish.

## Acceptance criteria

- [ ] Version and lockfile changes are consistent; full checks and packed-tarball smoke pass on the final candidate, with macOS and Linux evidence and CI links.
- [ ] With isolated empty npm and agent caches on a typical home connection, the packed candidate reaches a usable board within 60 seconds, with at most 10 MiB of registry response bodies and at most 10% of a comparable baseline. Comments record revision, platform, connection, cache state, elapsed time, bytes and baseline; first-stint downloads are separate. Do not clear the developer's cache.
- [ ] The dry run reports 0.2.0 and the intended package contents and metadata; Comments record commands, revision, artifact identity and results. No publication occurs.
- [ ] If the candidate changes, affected checks and the dry run are repeated against the final revision and artifact.

## Comments
