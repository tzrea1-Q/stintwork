# 02 — Repo link everywhere

Status: ready-for-human
Blocked by: none

## What to build

Add `repository`, `homepage` and `bugs` to the npm package metadata, pointing to `tzrea1-Q/stintwork`. Link the repo from README.md and README.zh-CN.md. Keep the rest of both READMEs unchanged. The metadata ships in the next patch release, with publishing left to the maintainer.

## Acceptance criteria

- [ ] `repository` identifies the GitHub repo, `homepage` points to its README and `bugs` to its issue tracker.
- [ ] Both READMEs link to the same repo.
- [ ] Changes are merged before ticket 03; Comments record the checks run.
- [ ] The next patch publishes the metadata with the maintainer's confirmation. Comments record the version and verified npm links, not just the prepared files.

## Comments

**Codex, 2026-10-13:** Added `repository`, `homepage` and `bugs` to root `package.json`, and one GitHub repo link near the top of each README in its language; the rest of both READMEs is unchanged. Inspected `scripts/build-package.mjs`: it reads root metadata for dependencies but only builds `dist/`, without generating, copying or rewriting package metadata. Packing uses root `package.json`, so no build-script change or conditional smoke assertion is needed. Checks: `pnpm --config.verify-deps-before-run=false format:check` passed (307 files); `pnpm --config.verify-deps-before-run=false lint` passed (283 licence-header checks and 308 linted files), with one existing Biome configuration deprecation info. Package build/smoke and pack dry-run were not run; packaging verification is by build-script inspection. Publishing this metadata waits for the maintainer's next patch release and confirmation; published npm links remain unverified. Version and Status are unchanged; no commit, push or publication.

**Coordinator, 2026-10-13:** Verified on `go-public`. `npm pack` of the branch contains `repository`, `homepage` (`#readme`) and `bugs` with the URLs above. Both README links point to the same repo. Checks as recorded on ticket 01: all six passed, 2100 tests. The remaining criterion is publishing: the next patch release, run by the maintainer. That release also carries ui-language 08, which go-public 05's real stint needs.
