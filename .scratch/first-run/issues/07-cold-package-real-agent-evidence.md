# 07 — Measure cold packages and verify real agents

Status: ready-for-agent
Blocked by: 03, 05, 06

## What to build

Extend on-demand/CI packaging verification with the repeatable baseline/candidate procedure in `docs/research/2026-10-17-first-run.md`. Keep empty consumer installation separate from empty npm/adapter caches, and a local-tarball clock separate from a full public download clock. Retain valid root packed/unpacked sizes and contents; do not substitute the spike's incomplete `--ignore-scripts` diagnostic.

Measure the usable board with normal detection, <=60 seconds, <=10 MiB registry response bodies and <=10% of a comparable measured baseline, with zero adapter/native downloads before readiness. Measure first-stint preparation/start separately for compatible installed CLIs and the selected-agent bundled fallback, recording source, reason and progress. Fallback native bytes are allowed only at selected-agent first use, not charged away or hidden in board results; an installed-compatible path downloads no native package. Record warm cache reuse and actual cache/offline/failure evidence.

**Coordinator-run checks:** registry cold installs/byte counting require network; HTTP servers, browser checks and any counting proxy require sockets/browser access; genuine stints and ACP contract probes require real agents and the developer's existing logins, normally with provider network. The agent may add the harness and run available isolated checks, but must leave missing permissions/resources as explicit coordinator checks in Comments. Do not access credentials or change logins/global CLIs. This ticket supplies evidence to ticket 08; it does not itself mark M9 shipped.

## Acceptance criteria

- [ ] Valid baseline/candidate tarballs have recorded versions/SHAs, packed/unpacked sizes, contents and dependency identities; missing build results are blockers, not size claims.
- [ ] Three independent cold runs record empty-cache proof, OS/arch/libc, Node/npm, registry/network conditions, all HTTP response-body bytes and browser-usable-board times with normal detection.
- [ ] Every board run meets <=60 seconds, <=10 MiB and <=10% comparable baseline, with no adapter/native fetch; local-file transfer/time exclusions are explicit.
- [ ] First-stint preparation/start bytes/time are separate for installed-compatible and bundled-fallback paths; UI evidence records source/reason/progress and only the selected fallback's native download.
- [ ] Coordinator evidence proves real stints under existing logins for each available agent and both Claude/Codex selection paths; unsupported, missing or blocked probes stay explicit, not passes.
- [ ] Warm cross-project reuse downloads nothing; coordinator cache/offline/interruption outcomes and cross-platform limits are recorded alongside automated checks.
- [ ] Required real-agent/network/socket checks and actual results or blockers are in Comments; ticket 08 remains responsible for the final M9 verdict.

## Comments

**Coordinator, 2026-10-17:** Baseline measured by the coordinator on the maintainer's machine (darwin-arm64, Node 22, home network in China, registry.npmjs.org, empty `--cache`): `npm install stintwork@0.1.1` took 1078 s; the isolated npm cache grew to 304 MB and `node_modules` to 652 MB, of which `@anthropic-ai/claude-agent-sdk-darwin-arm64` 240 MB and `@openai/codex-darwin-arm64` 331 MB (`du -sh`). Use it as the comparable baseline for the 10% budget.
