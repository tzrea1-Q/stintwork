<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Live updates and rare moments

Status: resolved
Blocked by: 02, 04

## What to build

**Live updates:**

- Stint stream messages arrive on `spring.arrive`. History loaded in bulk does not animate.
- Status chips and changing labels swap on `tween.swap` through `blur.swap`.
- The running dot's pulse pauses off screen and when the document is hidden. Under reduced motion it is static.

**Rare moments** (the expressive level):

- **Needs you:** the count pops on `spring.celebrate` when it rises.
- **Ticket resolved:** its check pops on `spring.celebrate` in the Tickets tab and in the gate's condition.
- **Gate approved:** the met conditions' checks pop in sequence on `stagger`, and the progress fills on `spring.number`.
- **Work item shipped** (Mark as shipped or a merge): after the Dialog closes, the card glides to Ship through ticket 04's layout. It then shows one success ring on `spring.celebrate`.

Scope: `StintStream.tsx`, `StatusChip`, `NeedsYouQueue.tsx` and its top-bar trigger, `GateView.tsx`, the Tickets tab in `WorkItemDrawer.tsx`, `MarkShipped.tsx`, their tests and `e2e/motion.spec.ts`.

## Acceptance criteria

- [ ] A new stream message is mid-flight early and at rest afterwards. Opening history with 50 messages animates none of them.
- [ ] Each rare moment plays once per event, never on a reload or a repeated snapshot of the same state.
- [ ] A status chip change never shifts the words around it, sampled frame by frame.
- [ ] Under reduced motion, the moments fade without scale, bounce or travel, and the pulse is static.
- [ ] The full browser suite passes. Comments include the coordinator's normal-speed and 10%-speed review on real data.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it, with the transition logic in `src/moments.ts`. Coordinator review in Chrome found and got fixed:
  - The resolve test's earlier snapshot kept an active stint whose status was `finished`, so the client rejected it and every later snapshot. Test data only; the product was right.
  - Two docked drawers coexisted while one exited. The exiting copy is now `inert` and `aria-hidden`.
  - The Needs you badge used three keyframes with a spring, which Motion does not support, so it never popped. It now springs up and back, including on 0→1.
- Real browser on this repository's data, in a git clone: Pipeline, Overview, Tickets and Spec at 1440 and 390px in en and zh-CN render as before, with no horizontal overflow. This repository's data has no live events, so the moments themselves were verified on the e2e fixture.
- Final runs:
  - `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm build` passed.
  - `pnpm test`: 3,529 of 3,529 passed.
  - `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 538 passed and 2 failed. The two are `motion-board` at 1440px (the long-task check) and `motion-moments` at 390px (the reduced-motion badge frames). Both passed in two serial reruns (4/4 each): they are load-sensitive.
