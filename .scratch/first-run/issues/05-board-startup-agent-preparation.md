# 05 — Separate board startup from agent preparation

Status: ready-for-agent
Blocked by: 04

## What to build

Remove eager adapter production dependencies from both root and agents manifests and integrate ticket 04's preparation at explicit stint start. Update runtime resolution, packaging/build/smoke checks and installation guidance; retain the CLI/server/web/workflow package contract without assuming adapters already exist in the consumer. Follow `docs/agents/frontend.md` for web changes.

Board startup and every availability refresh must neither download adapters/native binaries nor wait for a real ACP session, including Grok's existing 60-second readiness path. Use existing readiness seams to distinguish a missing CLI, compatibility selection, an unprepared adapter, login required and preparation failure. A missing or incompatible installed Claude/Codex CLI is not a permanent unavailable state: explicit stint start selects the pinned bundled fallback. Keep authoritative deep checks at stint start.

Show preparation progress and retry at stint start. Say whether the installed CLI or bundled agent is selected and why, including when an installed CLI is absent or unverified. Do not hide the bundled fallback or treat it as a request to install/upgrade the developer's global agent. Grok remains the developer's separately installed native CLI and login.

Preserve one published npm package, Node >=22.12, bundled workspace code, built web assets and workflow YAML. Do not merely move the adapters to optionalDependencies: default npm installation still downloads them. Grok stays native `grok agent stdio`, without Stintwork installing Grok packages.

Use only read-only local detection and cached evidence on board/availability paths; never label an untested agent ready. Show “Agent source: Installed” or “Agent source: Bundled”, selected executable path/version, adapter version and reason. Show the proposed source and download before preparation, retain actual source/reason at launch, and offer cancellation as well as retry. Keep the board usable offline with an honest “not prepared” state; document that offline npx needs the root cached and that package readiness proves neither login nor offline provider inference. Authentication errors point to the developer's own login command; never invoke login automatically, edit agent configuration or read, copy, store or proxy credentials.

## Acceptance criteria

- [ ] Root and agents packaging no longer eagerly install ACP adapters/native agent payloads; the packed package has no workspace-only leakage.
- [ ] Cold board/API/availability paths make zero preparation/download requests and do not await real-agent initialization.
- [ ] Explicit stint start invokes ticket 04 for the selected agent; absent/incompatible installed versions use its pinned bundled fallback, not a blocked missing-CLI state.
- [ ] The stint-start UI shows preparation progress, installed/bundled source and reason, and actionable failure/retry or login guidance.
- [ ] Readiness and launch agree on executable selection; Grok's native launch and the developer-owned login boundary stay intact.
- [ ] Packed version/help, health/project, web assets and workflow smoke checks still pass without eager adapter-presence assertions; frontend checks cover changed states and supported languages/widths.

## Comments
