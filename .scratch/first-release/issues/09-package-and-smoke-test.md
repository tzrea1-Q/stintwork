# 09 — Package and smoke test

Status: resolved
Blocked by: 01

## What to build

`npx stintwork` works outside the monorepo (spec user stories 1–9, 66). Build one publishable npm package named `stintwork`. It contains the CLI, the bundled server, core, agents and git code, the built web app and the bundled workflow YAML. Workspace packages stay private and are bundled at build time, and third-party dependencies (including the ACP adapters and `@agentclientprotocol/sdk`) stay normal dependencies. The package has no native dependencies, `engines.node` is `>=22.12`, and the version is `0.1.0`. Only the built output, README, LICENSE and workflow YAML are included. Add a packed-tarball smoke test: pack the package, install it into an empty temporary directory outside the monorepo, run `stintwork --version` and `--help`, start it in a fresh temporary git repo without opening a browser, and check `/api/health` and `/api/project`. Run it locally on demand and in CI on Ubuntu and macOS. Update the GitHub Actions versions that GitHub warned target Node 20.

## Acceptance criteria

- [x] The smoke test passes locally and in CI on Ubuntu and macOS.
- [x] The packed tarball contains no workspace-only references and no native modules.
- [x] Packing and installing need no network beyond the npm registry, and installation needs no build tools.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex. verify.sh passed (1412 tests). The coordinator ran the packed-tarball smoke test with network: stintwork-0.1.0.tgz (10 files, no native modules) installed outside the monorepo (128 packages); version, help, /api/health, /api/project, web assets and no browser all passed, in 57 s with a warm npm cache. A cold first run hit the 180 s install timeout on this machine's network (its ~/.npmrc points at registry.npmmirror.com; the test used the npm registry), so the coordinator raised the install timeout to 300 s. The installed CLI also ran by hand in an empty git repo. CI now runs the smoke test on Ubuntu and macOS (result recorded after the first push).
