# 02 — Repo link everywhere

Status: resolved
Blocked by: none

## What to build

Add `repository`, `homepage` and `bugs` to the npm package metadata, pointing to `tzrea1-Q/stintwork`. Link the repo from README.md and README.zh-CN.md. Keep the rest of both READMEs unchanged. The metadata ships in the next patch release, with publishing left to the maintainer.

## Acceptance criteria

- [x] `repository` identifies the GitHub repo, `homepage` points to its README and `bugs` to its issue tracker.
- [x] Both READMEs link to the same repo.
- [x] Changes are merged before ticket 03; Comments record the checks run.
- [x] The maintainer confirms the prepared metadata and that any patch published before M13 carries these links while the repo is private. Publication and live-link checks are recorded when they happen, not required to resolve this preparation ticket.

## Comments

**Codex, 2026-10-13:** Added `repository`, `homepage` and `bugs` to root `package.json`, and one GitHub repo link near the top of each README in its language; the rest of both READMEs is unchanged. Inspected `scripts/build-package.mjs`: it reads root metadata for dependencies but only builds `dist/`, without generating, copying or rewriting package metadata. Packing uses root `package.json`, so no build-script change or conditional smoke assertion is needed. Checks: `pnpm --config.verify-deps-before-run=false format:check` passed (307 files); `pnpm --config.verify-deps-before-run=false lint` passed (283 licence-header checks and 308 linted files), with one existing Biome configuration deprecation info. Package build/smoke and pack dry-run were not run; packaging verification is by build-script inspection. Publishing this metadata waits for the maintainer's next patch release and confirmation; published npm links remain unverified. Version and Status are unchanged; no commit, push or publication.

**Coordinator, 2026-10-13:** Verified on `go-public`. `npm pack` of the branch contains `repository`, `homepage` (`#readme`) and `bugs` with the URLs above. Both README links point to the same repo. Checks as recorded on ticket 01: all six passed, 2100 tests. The remaining criterion is publishing: the next patch release, run by the maintainer. That release also carries ui-language 08, which go-public 05's real stint needs.

**Coordinator, 2026-10-17:** Built and merged; Status stays ready-for-human pending the maintainer's confirmation. The repo stays private until M13, so these links return 404 until then. Any patch published before M13 carries them. This replaces the earlier publication gate for M7; live-link verification belongs to ticket 03 in M13.

**Coordinator, 2026-11-10: maintainer confirmation.** The maintainer confirmed the prepared metadata: `repository`, `homepage` and `bugs` in `package.json` and both README links point to `tzrea1-Q/stintwork`. No patch is published before M13, so v0.2.0 is the first release to carry them; live-link checks belong to ticket 03.
