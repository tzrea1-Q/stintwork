<!-- SPDX-License-Identifier: Apache-2.0 -->
# 05 — Live updates and rare moments

Status: ready-for-agent
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
