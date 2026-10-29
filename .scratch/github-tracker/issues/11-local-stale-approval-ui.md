# 11 — Show stale local gate approvals

Status: resolved
Blocked by: 09

## What to build

Show when a local gate approval became stale because HEAD changed while it was recorded, both immediately after approval and when projected in a project snapshot. Keep normal local approvals and GitHub gate behavior unchanged.

## Acceptance criteria

- [x] A raced local approval displays a message naming the approved stage and asking the developer to reopen it to review newer commits.
- [x] A projected stale local approval is listed with its stage; local approvals without a stale state show no approval-state line.
- [x] Local request and normal confirmation, and GitHub approval displays, remain unchanged.
- [x] Behavior and layout are checked at 1440, 1024, 768 and 390 px in en and zh-CN, with screenshots and the required color schemes.

## Comments

**Coordinator, 2026-10-29:** Resolved. Codex (gpt-6.1-terra) implemented it in three rounds. `codex review --base main` found that a real approval advances the stage and remounts the gate view, so the one-off message can be lost; the projected stale line now carries the reopen instruction and shows only for stages before the current one, so a reopened stage no longer asks to be reopened. A first e2e attempt published an advanced snapshot with `stage: tickets` but `column: spec`, which the client rightly rejected; this was a fixture bug, and the validator already accepts `state`/`stateReason`. Verified: format:check, lint, typecheck, build, full Vitest, package smoke and Playwright e2e (418 passed, including 42 new local stale cases at 1440/1024/768/390/360 px in en and zh-CN, with dark at 1440 and 390). The coordinator reviewed screenshots at 1440 and 390 px in both languages: the one-off message after approval, the projected line, and the advanced Tickets gate showing "Spec: Approval is stale ... Reopen Spec" beside the Reopen Spec button. No overflow or clipping.

Follow-up (not done): approving from the Needs-you queue removes the gate-ready item when the stage advances, so the one-off stale message is lost there and the projected line appears only in the work-item drawer. A durable signal outside the drawer, such as an attention item or a card badge for stale local approvals, is still needed.

