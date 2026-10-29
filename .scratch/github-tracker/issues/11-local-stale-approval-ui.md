# 11 — Show stale local gate approvals

Status: ready-for-agent
Blocked by: 09

## What to build

Show when a local gate approval became stale because HEAD changed while it was recorded, both immediately after approval and when projected in a project snapshot. Keep normal local approvals and GitHub gate behavior unchanged.

## Acceptance criteria

- [ ] A raced local approval displays a message naming the approved stage and asking the developer to reopen it to review newer commits.
- [ ] A projected stale local approval is listed with its stage; local approvals without a stale state show no approval-state line.
- [ ] Local request and normal confirmation, and GitHub approval displays, remain unchanged.
- [ ] Behavior and layout are checked at 1440, 1024, 768 and 390 px in en and zh-CN, with screenshots and the required color schemes.

## Comments
