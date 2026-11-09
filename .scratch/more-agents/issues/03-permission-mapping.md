# 03 — Antigravity permission levels

Status: ready-for-agent
Blocked by: 01, 02

## What to build

Map Ask, Edit freely and Autonomous to the probe-confirmed Antigravity session modes (`default`, `accept-edits`, `plan`) and permission options (`allow_once`, `reject_once`). Use the existing permission policy and preserve safe handling when capabilities differ from the research; record discrepancies rather than assuming an unsupported mapping.

## Acceptance criteria

- [ ] Each permission level and unsupported or unknown option is handled safely, with manual requests reaching Needs you when needed.
- [ ] Fake-agent tests cover mode selection, allow and reject, and unanswered or unexpected options.

## Comments

None yet.
