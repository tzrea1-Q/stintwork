# 04 — Prepare adapters in a pinned first-use cache

Status: ready-for-agent
Blocked by: 02, 03

## What to build

Implement the smallest npm-backed preparation/resolution seam described by tickets 02/03. On explicit first use, prepare only the selected pinned adapter and its released dependency closure in a user-owned cache outside project dependencies. A proven-compatible installed CLI uses its supported override with native optional packages omitted. Otherwise prepare that agent's pinned host-native bundled package and use it with the developer's existing login as today; never download the other agent's package or change a global CLI. In particular, unproven installed Codex 0.148.0 selects bundled 0.159.3.

Expose preparation progress, executable source (installed CLI or bundled) and the selection reason for ticket 05's stint-start UI. Keep executable identity and version checks consistent between readiness and launch; re-evaluate compatibility when the installed CLI changes. Grok keeps its existing native launch without an npm adapter cache.

Key entries by released adapter/dependency-lock identity and relevant platform/architecture/libc/Node compatibility. Use existing package-manager integrity checks, owned staging, per-key serialization and atomic verified completion. Cancelled, interrupted or failed preparation must retain good cache entries, never launch partial content and offer retry with the same pins. Cache reuse crosses projects and root package updates. The resolver must not prepare anything merely because board startup or availability refresh asks about an agent.

## Acceptance criteria

- [ ] Explicit selected-agent preparation resolves exact released adapter/closure/native versions and verifies integrity and entrypoints before marking ready.
- [ ] Compatible installed CLIs omit native payloads; missing/incompatible/unverified installed versions prepare only that agent's pinned host-native fallback and remain runnable under existing logins.
- [ ] All launch paths use the selected executable consistently and expose installed/bundled source, reason and preparation progress.
- [ ] Complete cache entries are reusable across projects; changed CLI identity/version triggers compatibility reselection, not stale reuse.
- [ ] Staging, concurrent preparation and atomic completion prevent partial launches and preserve prior good entries after cancellation, interruption or failure.
- [ ] Offline cold misses and install/integrity failures return actionable retry errors with unchanged pins; warm entries need no package download.
- [ ] No preparation occurs during board/availability inspection; no other-agent download, project dependency mutation, global CLI change or credential handling occurs.

## Comments
