# 12 — Surface stale local approvals in Needs you

Status: resolved
Blocked by: 11

## What to build

Keep a stale local approval visible in Needs you after its gate advances, with an action to reopen its stage.

## Acceptance criteria

- [x] Stale local approvals before the current stage produce durable attention items and disappear on reopening; merged and GitHub items are excluded.
- [x] Needs you shows translated titles, details and a reopen action with refusal handling; browser notifications show the translated title.
- [x] Behavior and layout are checked at 1440, 1024, 768 and 390 px in en and zh-CN, including required color schemes.

## Comments

**Coordinator, 2026-10-29:** Resolved. Codex (gpt-6.1-terra) implemented it in three rounds. A new `approval-stale` attention item (core `deriveStaleApprovalAttentionItems`) is shown in Needs you with a translated title and details and a Reopen action through the existing local reopen route. GLOSSARY lists "a stale approval" under Attention item. `codex review --base main` findings fixed: notifications and the reply-error prefix showed raw stage IDs in zh-CN (also true for `gate-ready` before this ticket, now fixed for both); a repeat stale approval of the same stage reused the item ID and would not notify; a malformed `approved.at` could make the client reject the whole snapshot. After the coordinator's screenshot review, the Reopen button moved below the item's meta lines, matching the other actions.

Verified on the branch with main merged: format:check, lint, typecheck, build, full Vitest (3,191 tests), package smoke and Playwright e2e (432 passed, including the new Needs-you case at 1440/1024/768/390/360 px in en and zh-CN, with dark at 1440 and 390). The coordinator reviewed screenshots at 1440 and 390 px in both languages; nothing overflows or is clipped. In one full run `github-lifecycle.test.ts` "offline reads wait for an in-flight local account check" failed under load (a 1,069 s run); it passed 29/29 when rerun alone.

Not done, by decision: browser notifications carry only the title, like every other attention kind (no details or action). Reopen commits directly from the queue, as gate approve and reopen do everywhere, rather than through the Dialog that `docs/agents/frontend.md` asks for on committing actions; that applies to all gate actions and needs its own decision. The reopen request does not carry the displayed approval's identity, so a queue item that is out of date could reopen an approval made since; the drawer's reopen button behaves the same way.

