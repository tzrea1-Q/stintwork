# 03 — Verify installed-CLI adapter compatibility

Status: ready-for-agent
Blocked by: 02

## What to build

Establish supported installed-CLI/adapter pairs with repeatable probes for the exact adapters in ticket 02. Use explicit executable paths and recorded versions; prove the installed-CLI path in an isolated adapter prefix with native optional packages absent. Test Claude's SDK stream/control interface and Codex's app-server v2 interface, not merely executable overrides or version/help output. Preserve ADR 0002's existing capability/probe expectations.

Record a compatibility selection policy for ticket 04: prefer a proven-compatible installed CLI; otherwise use only the selected agent's pinned bundled package under the developer's own login. The observed Codex 0.148.0 is outside adapter 2.1.1's bundled dependency range and selects bundled 0.159.3 until positively proven compatible; this is not a claim that the dependency range alone proves all external CLI versions compatible. Record Claude 2.1.295 versus SDK 0.3.293's bundled Claude 2.1.293 as another unverified pair until probed. Missing/unsupported installed versions must not leave a developer without a runnable fallback.

**Coordinator-run checks:** real authenticated stints, permissions/cancel/resume probes and bundled-versus-installed interoperability need the developer's real agents/login and usually provider network; package preparation needs registry network or complete cached artifacts. Any loopback socket checks require socket access. The implementing agent may add/run isolated fake-process checks without those resources, but must record blocked real/network/socket checks for the coordinator rather than claiming passes. Do not read credentials, sign in, change agent settings or upgrade global CLIs.

## Acceptance criteria

- [ ] Probe commands and results identify adapter, CLI, SDK/native reference versions, executable paths and tested environment.
- [ ] Installed Claude proves SDK initialization, streaming, tools, permission control and cancel; Codex proves app-server v2 initialization, turns, approvals and cancel, with remaining ACP contract scenarios recorded.
- [ ] Each supported installed pair works with native optional packages absent; version/help/path checks alone never establish compatibility.
- [ ] Unsupported, unverified or missing installed versions select the pinned bundled fallback with a reason; Codex 0.148.0 follows this rule unless positively verified.
- [ ] Real fallback probes preserve the developer's login and existing contract; unavailable agents/network/sockets remain explicit coordinator blockers, not passes.
- [ ] The recorded policy feeds ticket 04 without an unapproved adapter upgrade or global CLI/login change.

## Comments
