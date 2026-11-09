# More agents

Status: ready-for-agent

Milestone: M12 · More agents

See `docs/plan.md` (v0.2, M12), ADRs 0002, 0003, 0012 and 0018, and `docs/research/2026-11-09-antigravity-acp.md`.

## Problem Statement

Grok Build is registered but its current end-to-end flow is unverified. Antigravity CLI offers native ACP, but Stintwork does not yet detect or launch it, map its permissions or recover its stints. Its documented resume history behavior has conflicting reports.

## Solution

Probe the installed Antigravity CLI, then integrate `agy acp` using the version floor and capabilities proven by the probe. Keep it experimental until the M12 exit. Verify Grok Build through [agent-polish 04](../agent-polish/issues/04-grok-end-to-end.md), which remains in M4 and is back in scope for M12. The developer owns installation and sign-in; agents never sign in or read credentials.

## User Stories

1. As a developer, I can see whether Antigravity CLI is ready and start a stint using my own login.
2. As a developer, I can use Stintwork's permission levels and stop or recover a stint safely.
3. As a maintainer, I can verify each agent with a real stint and parsed handoff before marking M12 shipped.

## Implementation Decisions

Use the installed `agy` on PATH, with no bundled adapter. Launch `agy acp` without changing sandbox defaults or skipping permissions. The authenticated probe establishes the minimum supported version and actual capabilities; fail clearly when the version is missing, unparseable or below the proven floor. Show setup and authentication guidance in English and zh-CN. Preserve ADR 0003's credential boundary.

Map permission levels to the modes and permission options observed in the probe. Preserve M10's restart safeguards and use a new-process resume without replaying the brief when proven; if recovery fails or is unsupported, use the checkpoint fallback and let the developer start a new stint. Record any discrepancy between documentation and observed behavior.

## Testing Decisions

Use fake-agent tests for registration, readiness, permission decisions, cancel and restart behavior. The coordinator records the five authenticated ACP scenarios and real stints after the maintainer installs and signs in. Never claim a live result from a fake test.

## Out of Scope

Bundling Antigravity, handling credentials, changing sandbox defaults, or marking the milestone shipped without the maintainer.

## Acceptance Criteria

- [ ] Antigravity is detected, launched and presented as experimental, with a probe-backed version floor and localized setup guidance.
- [ ] Permission, cancel and restart behavior follow the recorded evidence and preserve the fallback.
- [ ] The coordinator records a real stint each with Grok Build and Antigravity CLI, each ending in a parsed handoff; the maintainer marks M12 shipped.
