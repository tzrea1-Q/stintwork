# 03 — Package and release dry run

Status: resolved
Blocked by: 01, 02

## What to build

Prepare the 0.2.0 version and package from the release candidate. Run the repository's full checks and packed-tarball smoke on macOS and Linux, locally or in CI. Exercise the existing CI and manual npm release procedure with `npm publish --dry-run`; inspect the packed files, metadata and version. Measure a cold-cache first run using the M9 method and budget. Do not publish.

## Acceptance criteria

- [x] Version and lockfile changes are consistent; full checks and packed-tarball smoke pass on the final candidate, with macOS and Linux evidence and CI links.
- [x] With isolated empty npm and agent caches on a typical home connection, the packed candidate reaches a usable board within 60 seconds, with at most 10 MiB of registry response bodies and at most 10% of a comparable baseline. Comments record revision, platform, connection, cache state, elapsed time, bytes and baseline; first-stint downloads are separate. Do not clear the developer's cache.
- [x] The dry run reports 0.2.0 and the intended package contents and metadata; Comments record commands, revision, artifact identity and results. No publication occurs.
- [x] If the candidate changes, affected checks and the dry run are repeated against the final revision and artifact.

## Comments

**Coordinator, 2026-11-10: release candidate checks.** Candidate `2b782f4` sets version 0.2.0 in `package.json`, the package test and the package smoke; the lockfile is unchanged (`pnpm install --frozen-lockfile --offline` passed).

- **Full checks, macOS (local, darwin-arm64):** `format:check`, `lint`, `typecheck`, `build`, `test` (3,357 passed), `smoke:package` and `test:e2e` (432 passed) all passed.
- **CI:** [run 42785721063](https://github.com/tzrea1-Q/stintwork/actions/runs/42785721063) succeeded on `2b782f4`: checks, both browser shards, and package-smoke on ubuntu-latest and macos-latest.
- **Dry run:** `npm publish --dry-run` reported `stintwork@0.2.0`, 46 files, 595.1 kB packed, 2.3 MB unpacked, shasum `bf6e2ef16c5de3083af02725ce27278115f466fb`. No publication occurred. The maintainer's npm default registry is a mirror (`registry.npmmirror.com`), so the real publish must pass `--registry https://registry.npmjs.org`. The registry currently lists 0.0.0-stage, 0.1.0 and 0.1.1.
- **Cold first run (M9 method):** `scripts/measure-first-run.mjs` with `PLAYWRIGHT_CHROME_CHANNEL=chrome`, fresh consumer, npm cache and agent cache per run (the developer's caches were not touched), registry.npmjs.org direct over the maintainer's home broadband in China, darwin-arm64, Node 22.22.3. Candidate tarball from `pnpm pack` (597,968 B, 46 files):

| Subject | Run | Install start → usable board | Registry response bodies | Requests |
|---|---|---|---|---|
| stintwork@0.1.1 (baseline) | 1 | 166.5 s (install 154 s) | 254,140,138 B | 269 |
| candidate 0.2.0 | 1 / 2 / 3 | 7.1 / 6.7 / 6.7 s | ~3.30 MB each (+0.60 MB local tarball, budgeted) | 18 |

`--compare` against the baseline: 3/3 PASS. Every candidate is within 60 s, under 10 MiB and about 1.5% of the baseline. The agent cache stayed empty, with no adapter or native package request before the board was usable. First-stint downloads were not measured here.

The candidate changes only with docs-only commits before publication; the dry run is repeated on the final revision.

**Coordinator, 2026-11-10: final revision.** `33125f8` changed only docs and tickets after `2b782f4`. CI [run 42787956629](https://github.com/tzrea1-Q/stintwork/actions/runs/42787956629) succeeded on it (checks, browser shards, package-smoke on ubuntu-latest and macos-latest). `npm publish --dry-run --registry https://registry.npmjs.org` on the clean `33125f8` reported 0.2.0, 46 files and the same shasum `bf6e2ef16c5de3083af02725ce27278115f466fb`, so the measured artifact's contents are unchanged. No publication occurred during these checks.
