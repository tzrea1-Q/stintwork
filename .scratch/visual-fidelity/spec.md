<!-- SPDX-License-Identifier: Apache-2.0 -->
# Visual fidelity

Status: ready-for-agent

Milestone: M15 · Visual fidelity. See `docs/plan.md`, `GLOSSARY.md`, ADR 0006, ADR 0019, `docs/agents/frontend.md` and `.scratch/visual-refresh/spec.md`.

## Problem Statement

M14 shipped on 2026-11-11, but the maintainer found the app rougher and plainer than Variant D of `prototype-visual-v1`. On 2026-11-12 the coordinator compared both at 1440px. The tokens match: colours, 14px root, radius and card shadow. The drift is in hierarchy, content and acceptance:

- **Flat type scale.** Page titles are 26px/500 instead of D's 39px tight titles; card titles 12px/500 instead of 13px/620; the detail title 16px with no identity block. Card headings have no uppercase eyebrow, so everything reads at one size.
- **Thin Overview.** D is a three-column dashboard: a large milestone percentage with a target marker, stage bars split into running and waiting, a gradient Next up card, and an activity chart. The app shows text rows in a few cards with large empty areas. Shipped-only milestones collapse to one line.
- **Grey, repetitive board.** Cards are tinted by state in code, but most real items have no stint, so every card is the same grey and repeats "No active stint" and "Inferred". Empty columns are stacked 64px slivers that unbalance the board.
- **Form-like detail.** Six per-stage agent selects take half the panel; D shows one "Agent for this stage" row under an identity block.
- **Top bar.** D's logo mark, bold wordmark and project switcher became a small asterisk and plain text.
- **Acceptance never compared against D.** M14 accepted layout correctness (overflow, clipping, gutters) and the coordinator reviewed for defects, so visual drift accumulated unchecked. D's fake data was also richer than this repository's real data, and the design was never checked against real data at the prototype stage.

## Solution

Bring every screen to Variant D's fidelity using only data the project snapshot already supplies or derives. Make the Variant D comparison an acceptance criterion on every ticket. Check each screen against D with the rich e2e fixture and this repository's real data.

## User Stories

1. As a developer, I want a clear visual hierarchy, so I can find the important thing on each screen at a glance.
2. As a developer, I want Overview to show progress visually, not as text rows.
3. As a developer, I want board cards that say only what differs between items.
4. As a developer, I want the detail panel to read as a work item, with configuration out of the way.
5. As the maintainer, I want each screen compared side by side with Variant D before I accept it.

## Implementation Decisions

- **Reference:** Variant D at tag `prototype-visual-v1` (branch `prototype/visual-direction`) stays the visual reference. Rebuild from it; never import its code. Run it with `cd prototype-visual && pnpm install && pnpm build && pnpm exec vite preview`, URL `?variant=D&theme=light|dark&lang=en|zh-CN`.
- **Type scale:** page titles 39px (34px below 768px) with -0.055em tracking; uppercase eyebrow labels over card titles; card titles 13px/620; detail identity title 18px; tabular numerals for counts. Put these in shared patterns, not per screen.
- **Overview data:** derive only from the existing snapshot, with no new core or server state (ADR 0006).
  - Milestone percentage is the work-item done count already shared by Overview, Edit roadmap and the milestone filter (`workItemDone`).
  - The target marker comes from `milestone.target`.
  - The stage bars split each count into running (`activeStint`) and waiting (attention items).
  - The activity chart counts stints by `startedAt` day over the last 7 days.
  - Omit trend deltas such as "+8% vs last week": ticket resolution times are not recorded.
  - When no milestone is active or planned, show the most recently shipped milestone rather than only a collapsed list.
- **Board:** keep state tints. Show a status line only when it carries information (running, waiting, blocked, stopped). Show inference as an avatar tooltip, not a row. Empty columns follow D: one header with icon, name and count, not stacked slivers.
- **Detail:** an identity block (tinted, title, milestone, workflow, branch) as in D. Show the current stage's agent as one property row. Move every per-stage agent selection into a collapsed "Agents by stage" disclosure that keeps all existing behaviour.
- **Top bar:** logo mark and bold wordmark, project and branch in one pill, Needs you with a count badge. Keep every M14 behaviour.
- **Overlays:** restyle the Needs you list, command palette and dialogs to D's density. Turn Edit roadmap into compact milestone rows that expand to edit, instead of a full form per milestone.

## Testing Decisions

- Keep the M14 browser suite: 1440, 1024, 768, 390 and 360px, `en` and `zh-CN`, light and dark at 1440 and 390px.
- Add a rich e2e fixture state (an active milestone with a target, running, waiting, blocked and stopped items, stint history across 7 days) so screens are compared on data comparable to D's.
- Every ticket's Comments include side-by-side screenshots of D and the app at 1440 and 390px for the screens it changes, on the rich fixture and on this repository's real data, and the coordinator's review against D.
- Unit tests cover each new derivation (percentage, stage split, 7-day counts, fallback milestone).

## Out of Scope

- New core or server state, fake metrics, trend deltas, and D's Stints and Roadmap pages.
- A user avatar or accounts: Stintwork has none.
- Changing behaviour, entry points or shortcuts that M14 kept.

## Further Notes

The coordinator's 2026-11-12 comparison measured the numbers above in a real browser and the prototype's CSS. M14 itself remains shipped; this milestone corrects its visual drift.
