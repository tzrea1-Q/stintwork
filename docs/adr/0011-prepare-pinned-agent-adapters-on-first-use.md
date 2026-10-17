# Prepare pinned agent adapters on first use

Prepare only the selected agent on explicit first use into a reusable per-user cache. Prefer a proven-compatible installed CLI; otherwise prepare that agent's pinned bundled package. Never prepare or download agents during board startup or availability refresh. The coordinator's baseline took 1078 seconds and used 652 MB in node_modules; [research](../research/2026-10-17-first-run.md) explains the duplicate native downloads.

This replaces the [first-release decision](../../.scratch/first-release/spec.md#implementation-decisions) to ship both adapters as normal dependencies. [ADR 0002](0002-agents-integrate-through-acp.md)'s ACP contract, pins and probes stand. This narrowly supersedes [ADR 0003](0003-use-the-developers-own-agents-and-logins.md) only by allowing a bundled fallback download at first use: the developer's own-login and no-credentials boundary holds. Global CLIs and agent configuration remain unchanged. Grok stays native `grok agent stdio`.

## Constraints

- Pin `@agentclientprotocol/claude-agent-acp@0.88.0` with SDK/native packages 0.3.293, and `@agentclientprotocol/codex-acp@2.1.1` with launcher 0.159.3 and host-native package `0.159.3-<platform>-<arch>`. Ship the complete released dependency lock and integrity values; no runtime version resolution. Installed paths omit native packages.
- Publish cache entries atomically only after verification; reuse across projects. Ownership, failure recovery and compatibility evidence belong to tickets [03](../../.scratch/first-run/issues/03-installed-cli-compatibility.md) and [04](../../.scratch/first-run/issues/04-first-use-adapter-cache.md).
- Keep the board usable offline with a clear “not prepared” state; cold offline npx still requires the root package cached.
- Show Agent source (Installed/Bundled), selection reason and preparation progress at stint start.

Board budgets: ≤60 seconds and ≤10 MiB downloaded; measurement details and the comparable-baseline limit are in [ticket 07](../../.scratch/first-run/issues/07-cold-package-real-agent-evidence.md).

Maintainer approval is required before implementation; this record does not pass the M9 exit.
