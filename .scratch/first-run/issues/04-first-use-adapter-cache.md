# 04 — Prepare adapters in a pinned first-use cache

Status: ready-for-agent
Blocked by: 02, 03

## What to build

Implement the smallest npm-backed preparation/resolution seam described by tickets 02/03. On explicit first use, prepare only the selected pinned adapter and its released dependency closure in a user-owned cache outside project dependencies. A proven-compatible installed CLI uses its supported override with native optional packages omitted. Otherwise prepare that agent's pinned host-native bundled package and use it with the developer's existing login as today; never download the other agent's package or change a global CLI. In particular, unproven installed Codex 0.148.0 selects bundled 0.159.3.

Expose preparation progress, executable source (installed CLI or bundled) and the selection reason for ticket 05's stint-start UI. Keep executable identity and version checks consistent between readiness and launch; re-evaluate compatibility when the installed CLI changes. Grok keeps its existing native launch without an npm adapter cache.

At stint start (tickets 04/05), confirm a compatible-by-range installed CLI with a cheap ACP handshake (`initialize` plus a new session, no prompt) against the pinned adapter. If the handshake fails, fall back to the selected agent's pinned bundled package for that stint, record reason `handshake failed`, and surface it with the Agent source.

Key entries by released adapter/dependency-lock identity and relevant platform/architecture/libc/Node compatibility. Use existing package-manager integrity checks, owned staging, per-key serialization and atomic verified completion. Cancelled, interrupted or failed preparation must retain good cache entries, never launch partial content and offer retry with the same pins. Cache reuse crosses projects and root package updates. The resolver must not prepare anything merely because board startup or availability refresh asks about an agent.

Ship release-controlled npm manifests and `package-lock.json` profiles with the root package. Pin `@agentclientprotocol/claude-agent-acp@0.88.0`, `@anthropic-ai/claude-agent-sdk@0.3.293` and its host-native package at 0.3.293; pin `@agentclientprotocol/codex-acp@2.1.1`, the `@openai/codex@0.159.3` launcher and host alias `@openai/codex-<platform>-<arch>` for actual package `@openai/codex@0.159.3-<platform>-<arch>`. Use the research's platform/libc matrix, not a guessed compatibility floor. Lock all peers/transitives, resolved artifacts and SHA-512 integrities. Installed profiles omit native optionals; bundled profiles include only the selected host-native package as a required exact dependency, preserving aliases. Use frozen `npm ci` with optionals omitted and install scripts disabled; any necessary preparation step must be release-reviewed and shipped in the profile. Fail on missing lock/integrity data or mismatches; never resolve semver, latest, a PATH adapter or newer transitives at runtime. The repo's pnpm lock alone is insufficient.

Allow the preparation smoke check's first executable launch, including `--version`, up to 60 seconds for macOS scanning of a freshly downloaded native binary, and record its measured elapsed time on success or failure.

Resolve supported explicit overrides or PATH CLIs to absolute paths. Apply `CLAUDE_CODE_EXECUTABLE` and `CODEX_PATH` consistently to readiness, stint launches and adapter subprocess helpers. Unsupported platforms or failed fallback preparation must return actionable errors; never switch executable sources to mask authentication, permission or provider failures.

Cache identity includes agent/adapter version, manifest/lock digest, installation profile, OS/architecture/libc, Node major and module ABI. Keep the cache outside project files and node_modules; document its path/override. Own only namespaced entries, locks and staging directories, never normal npm caches, global installs or login data. Reject unsafe ownership, symlink escapes and shared writable executable entries; keep credentials out of entries and logs. Install into unique sibling staging on the same filesystem; verify manifests, integrity, entrypoints and executable identities, smoke-check adapter startup and publish atomically. Maintain an installed-file integrity manifest and verify it before reuse. Package completion is not login readiness. Serialize per key across processes; recover stale ownership only after establishing its process is gone, and let concurrent callers reuse the published result. On timeout, disk-full, cancellation or failure, clean only that attempt's incomplete files and retain good entries.

## Acceptance criteria

- [ ] Explicit selected-agent preparation resolves exact released adapter/closure/native versions and verifies integrity and entrypoints before marking ready.
- [ ] Compatible installed CLIs omit native payloads; missing/incompatible/unverified installed versions prepare only that agent's pinned host-native fallback and remain runnable under existing logins.
- [ ] All launch paths use the selected executable consistently and expose installed/bundled source, reason and preparation progress.
- [ ] Complete cache entries are reusable across projects; changed CLI identity/version triggers compatibility reselection, not stale reuse.
- [ ] Staging, concurrent preparation and atomic completion prevent partial launches and preserve prior good entries after cancellation, interruption or failure.
- [ ] Offline cold misses and install/integrity failures return actionable retry errors with unchanged pins; warm entries need no package download.
- [ ] No preparation occurs during board/availability inspection; no other-agent download, project dependency mutation, global CLI change or credential handling occurs.

## Comments
