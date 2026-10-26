# 07 — Show recovery and fallback in both languages

Status: ready-for-agent
Blocked by: 06

## What to build

Finish the spec's recovery copy and state presentation across Pipeline/work-item drawer, Needs you, active stream and stint history. Keep the existing running lifecycle with a recovery phase and the same stint identity. Show Resuming stint / 正在恢复 Stint, reconnecting versus answerable permission, resumed marker, concrete fallback/checkpoint failure and existing Start new stint action. Use the spec's English/Chinese copy table and glossary; keep agent-authored content unchanged.

Expose recorded source/executable/version/adapter and recovery reason through existing details. Stop remains available during load; Start and conflicting mutations cannot act on a recovering stint. History replay is read-only, and WebSocket reconnect/snapshot refresh must not duplicate or lose events/attention. Recovery success alone adds no attention item. Use existing CoreText/i18n, components and tokens under `docs/agents/frontend.md`; no new settings, Resume control or parallel view.

Add focused behaviour and browser cases to the existing harness, including slow loading, long paths/reasons, permission controls, Stop and fallback. Save review screenshots rather than pixel baselines.

## Acceptance criteria

- [ ] All specified states, errors and accessible labels exist in `en`/`zh-CN`, using glossary terms and unchanged agent-authored option/content text.
- [ ] Drawer, queue, stream and history agree on the same stint/recovery state and source details, including checkpoint failure and legacy/Grok fallback reasons.
- [ ] Resuming has usable Stop and blocked conflicting actions; permission reconnecting/answering states and terminal replay expose only valid actions.
- [ ] Snapshot/WebSocket reconnection keeps one event history and one logical permission; no spurious recovery-success attention item appears.
- [ ] jsdom behaviour checks cover actions, keyboard/focus and loading/error/long-content states with shared components/tokens.
- [ ] Coordinator-run browser cases pass at 1440/1024/768/390px in both languages, support 360px, and cover light/dark at 1440/390px where styling changes; screenshots are retained.
- [ ] Comments record actual checks and coordinator screen review at 1440/390px in both languages, with missing browser/socket resources explicit.

## Comments

**Codex, 2026-10-26:** Local jsdom/catalog checks do not require real agents or provider network. Browser/screenshots, HTTP/WebSocket checks and real-agent UI acceptance are coordinator-run. This ticket supplies UI evidence, not the M10 exit verdict.
