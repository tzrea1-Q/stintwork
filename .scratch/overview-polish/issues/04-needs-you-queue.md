<!-- SPDX-License-Identifier: Apache-2.0 -->
# 04 — Needs you queue

Status: resolved
Blocked by: 02

## What to build

Fix spec findings A7 (queue), A8, A9, B7, C1–C10 and E5 with the spec's decisions 4 and 5.

- One item layout for every kind: icon, title naming the work item, one metadata line (agent, ticket, stint, waiting time), the kind's content, then its actions. No repeated kind label, heading, agent or stint id.
- A distinct icon per kind, from lucide-react.
- Order: permissions first, then login, gate ready, handoffs, memory proposals, checkpoint warnings, stale approvals; within a kind, oldest first.
- A ready gate shows the compact summary of decision 5, with Approve and "Open gate".
- Memory proposal card headed by its path; checkpoint warnings as one list of paths with their reasons and short commit hashes, one explanation, and attention colour only on the icon and heading.
- Feedback: a result shows once, next to the item it belongs to (inline status or error); toasts only where the item disappears.
- "Enable browser notifications" moves out of the permanent footer (for example into the header as an icon toggle with a tooltip, or into Settings).
- Durations through ticket 02's helper. Memory proposal and login titles and details translated in `zh-CN`; "Stint" everywhere; the stale approval action names the stage unambiguously.
- Overview's Needs you rows open the queue scrolled to that item with focus and a brief highlight (decision 4).

Scope: `NeedsYouQueue.tsx`, `GateView.tsx` (a compact variant only; the detail panel's gate is unchanged), `MemoryProposal.tsx`, `CheckpointWarnings.tsx`, `PermissionAnswer.tsx`, `HandoffAnswer.tsx`, `useAttentionAlerts.ts`, `Overview.tsx` (attention rows only), both catalogs, and tests.

## Acceptance criteria

- [x] jsdom tests cover ordering, scroll-to-item with focus from Overview, the compact gate (Approve and Open gate) and that each kind renders the shared layout.
- [x] In `zh-CN` no English Stintwork copy remains in any of the seven kinds.
- [x] Browser cases at 1440 and 390px in both languages with the rich fixture plus every attention kind pass the layout checks; screenshots are saved.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-25:** Verification.

- Codex implemented it in two slices: 04a, the shared item layout, icons, ordering and durations; 04b, the compact gate, memory and checkpoint content, inline feedback, the header notification toggle and opening at an item.
- Coordinator review on real data and the rich fixture with all seven kinds found two problems, both fixed by Codex:
  - Memory proposals, checkpoint warnings and Stint recovery nested a card inside the item. They now render flat (`variant="inline"`).
  - Checkpoint explanations ran long. They are now short strings.
- Real data: Overview rows open the queue scrolled to the item, with focus on it and a brief highlight; the top bar's Needs you opens at the top. zh-CN shows "已等待 34 天", "Stint" and "重新开启「工单」阶段".
- Tests:
  - jsdom: `sortAttentionItems` ordering; all seven kinds share the layout in both languages; the compact gate approves and Open gate opens the work item; inline failure and a single success status; the header notification toggle; and in `Board.test.tsx`, Overview rows focusing their queue item.
  - A further Codex round added the browser case `Needs you all seven kinds` at 1440 and 390px in both languages. It checks:
    - the priority order;
    - one heading per item;
    - Open gate;
    - no English titles in zh-CN headings or metadata;
    - layout checks at every scroll position, with screenshots.
  - `drawer-and-needs-you.spec.ts` with `overview.spec.ts`: 90/90.
  - Full suite: see ticket 02.
