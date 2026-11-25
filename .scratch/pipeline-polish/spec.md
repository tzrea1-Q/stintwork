<!-- SPDX-License-Identifier: Apache-2.0 -->
# Pipeline polish

Status: ready-for-agent

Milestone: M19 · Pipeline polish. See `docs/plan.md`, `GLOSSARY.md`, ADR 0019, ADR 0020, ADR 0021, ADR 0022 and `docs/agents/frontend.md`.

## Problem Statement

On 2026-11-25 the coordinator audited Pipeline and every surface it opens:
- the toolbar;
- stage columns and work item cards;
- the work item detail panel (docked, Sheet and full screen) with its Overview, Spec, Tickets and Stints tabs;
- the gate, live Stint and permission blocks;
- the review overlay, Brief preview, Edit roadmap, Customise workflow and Mark as shipped.

The audit used this repository's real data at 1440, 1024, 768 and 390px in both languages and both colour schemes, plus the rich browser fixture with running, waiting, recovering and reviewing work items. The maintainer asked for every finding to be fixed, following the coordinator's recommendations.

**Broken or misleading.**

- **A1.** Pipeline counts every unmerged work item as active. On this repository 16 of the 20 cards belong to shipped milestones (M1–M14) and sit in Implement and Review. The toolbar reads "20 active · 0 shipped", the Shipped lane shows 0, and Overview says 4 in flight.
- **A2.** Stints show raw ISO times in English ("Started 2026-10-10T03:41:00.551Z") while Chinese formats them. "Open stint" buttons carry full UUIDs, and checkpoint commits, the review's branch head and merge base show full 40-character hashes.
- **A3.** Agents appear as raw ids ("codex", "custom-agent") in Stint rows and Customise workflow, and in Chinese "本阶段的 Agent: codex" where English says "Codex".
- **A4.** The Tickets tab shows the raw status "ready-for-human".
- **A5.** Edit roadmap's per-milestone progress counts work items: M15 shows 0/1 where Overview shows 83% by tickets.
- **A6.** In Customise workflow the YAML scrolls under the footer and continues below it.
- **A7.** In the review overlay a finding's severity chip ("blocker") stretches across the whole finding.
- **A8.** A gate can show a full progress bar and Ready conditions while Approve is disabled (for example while a Stint is running). The disabled button is a washed-out grey with no reason beside it.
- **A9.** Stop stint uses a square icon that reads as a checkbox.
- **A10.** Chinese names the Spec stage "规格说明" on the board and "规格" in the detail tabs.
- **A11.** "Open review" is the near-black primary action for work items in Clarify or Spec, and the footer can hold two primary actions.

**Board.**

- **B1.** Empty stages collapse into narrow columns with rotated English or stacked Chinese labels.
- **B2.** Horizontal overflow has no affordance. Columns are cut at 768px and when the panel is docked. The previous/next stage arrows appear only at some widths, unlabelled, in the toolbar far from the columns.
- **B3.** At 390 and 360px the board is a horizontal strip: one column is visible, cards are cut, the toolbar takes three rows and the counts sit alone on a line.
- **B4.** Cards repeat one sparkle icon on every card, show milestone ids ("m4", "active"), show "0/0 tickets" when there are no tickets, show an agent avatar on work items that never had a Stint, and fill the whole card with the status colour.
- **B5.** Column headers always read "0 running · 0 waiting".
- **B6.** The Shipped lane is a native `<details>`. The board card's fixed minimum height leaves empty space.
- **B7.** Board, column and card files use arbitrary values (`min-h-[360px]`, `h-[88px]`, `text-[13px]`, `font-[620]`, `min-w-[220px]` and others).

**Detail panel.**

- **C1.** The header is a violet box, but `frontend.md` reserves violet for selection and focus. A lone agent avatar sits there without meaning, and "Customise" floats as a text action that customises the workflow, not the work item.
- **C2.** "Agents by stage", Spec "Contents", tool output, a finding's raw reply and check output use native `<details>`. Property labels wrap ("Work item files live in this worktree:").
- **C3.** The gate shows two progress bars (conditions and tickets) and each condition repeats the gate's sentence. At 390px the status chips wrap under the titles. Stages without a ticket condition show "0/0 tickets resolved". Empty "Last checkpoint", "Last handoff" and "Open warnings" each take a block.
- **C4.** The live Stint's permission block repeats itself: title, a waiting note, "Permission request", "Stint: stint". A violet "Waiting for your permission answer" line follows it.
- **C5.** The footer's "06 · M18 exit" has no label, and "Local Markdown tracker · Esc to return to Pipeline" adds noise.
- **C6.** Full screen stretches the content to the window: gate rows and text run 1400px wide.
- **C7.** Opening the panel from a link draws a focus ring on the close button or the first tab.
- **C8.** Every ticket is a bordered card with its status on a second line.
- **C9.** Stints run together without separation. Handoff labels and bodies sit on different baselines. "No stints yet." is bare text.
- **C10.** The recovery card has large empty padding.
- **C11.** Opening the docked panel on a 60-card board is one long task of about 100 ms on a CPU three times slower than the maintainer's (measured on CI and with CPU throttling, `.scratch/motion/issues/07-ci-motion-checks.md`). The time goes to the React commit, Motion's layout snapshot of every card, and a forced page layout.

**Overlays.**

- **D1.** The review overlay's header stacks unstructured meta lines, and "Send back" sits in the primary position at the top right. The file list breaks paths at every segment. The three filters are full-width selects. At 390px the header is crowded.
- **D2.** In Brief preview:
  - the agent label and icon sit apart from the picker;
  - a lone "Not prepared" chip sits in a bordered box;
  - the sandbox warning is plain amber text rather than a callout;
  - there is no Cancel.
- **D3.** Edit roadmap closes through a "Close roadmap" text button where other dialogs use the close icon, and its target date is a bare native date input.
- **D4.** Mark as shipped has no close button.

**Code.**

- **E1.** `WorkItemDrawer.tsx` is 1129 lines and `Board.tsx` 808.
- **E2.** Times and ids are formatted ad hoc per component and per language.

## Solution

Fix every finding above. Decisions, recommended by the coordinator from the developer's point of view and accepted by the maintainer:

1. **In flight on the board.** Pipeline uses Overview's rule: a work item is in flight when it is not merged and its milestone is not shipped. Stage columns show only work in flight. The bottom lane lists merged work items as Shipped, and lists work items of shipped milestones whose merge was never recorded in a separate group, each with Mark as shipped (ADR 0021). The toolbar counts in-flight and shipped work.
2. **Narrow widths show one stage at a time.** Below 768px, a stage switcher (every stage with its count, scrollable) replaces horizontal scrolling. The cards of the chosen stage are full width.
3. **Empty stages stay compact and readable.** At 768px and wider, an empty stage keeps a narrow column with its icon, count and a horizontal name, never rotated text.
4. **Overflow is visible.** When columns overflow, the board shows edge fades and labelled previous/next buttons in the board's own header.
5. **A neutral detail header.** It holds the title, one meta line (workflow · milestone · stage), and the status and branch chips. Customise workflow moves into a menu. The agent appears in the properties, not as a lone avatar.
6. **One primary action per panel.** The footer's primary action is the stage's next step: Start stint, Approve when the gate is ready, or Open review in the Review stage. Everything else is secondary. The next ticket is labelled ("Next ticket: 06 · M18 exit").
7. **One gate layout.** The detail panel's gate follows the queue's compact summary (conditions met x/y, unmet conditions with their reason) and then lists every condition. It has one progress bar and no repeated sentences. Empty evidence collapses into one line. A disabled Approve states its reason beside it.
8. **Times, ids and agents read the same everywhere.**
   - Times are relative ("2 hours ago"), with the full time in a `title`, in both languages.
   - Durations go through `formatDuration`.
   - Stint ids show 8 characters and hashes 7, each with copy.
   - Agents show their display name.
9. **Performance.** Opening the docked panel on the 60-card motion fixture must not block the page for long. The target is no long task over 60 ms with Chrome's CPU throttled 3x, measured the same way as `e2e/motion-board.spec.ts`.

## Implementation Decisions

- One helper (`workItemInFlight` in `overview-data.ts`) decides in flight for Overview, Pipeline and the toolbar counts. Never add a second definition.
- One time helper beside `duration.ts` formats relative times and full times from the catalog's language. One small helper shortens ids and hashes. Every surface in scope uses them.
- Native `<details>` in scope become `ui/Disclosure`.
- The detail panel splits into one component per tab and section under `src/work-item/`. The board's toolbar, lanes and narrow stage switcher move out of `Board.tsx` into `src/board/`.
- Colours, sizes and type come from tokens. A test, like `src/overview/no-hardcoded.test.ts`, guards the new `src/board/` and `src/work-item/` folders.
- Chinese uses "规格" for the Spec stage everywhere, matching `GLOSSARY.md`'s Chinese table (add it there if missing).

## Testing Decisions

- jsdom tests cover:
  - in flight on the board and the lane groups;
  - the toolbar counts;
  - the narrow stage switcher;
  - the footer's single primary action per stage;
  - the gate's compact summary and disabled reason;
  - the time and id helpers in both languages;
  - Disclosure keyboard behaviour where `<details>` was replaced.
- Browser cases use this repository's real-shaped data and the rich fixture at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px. They assert:
  - no cut cards, a visible overflow affordance when columns overflow, and one stage at a time below 768px;
  - no rotated text;
  - one near-black primary in the detail panel;
  - no full UUID or 40-character hash in visible text;
  - the layout checks.
- The motion and long-task checks in `e2e/motion-*.spec.ts` keep passing. The performance target in decision 9 is measured with CDP CPU throttling and recorded in the ticket.
- The coordinator reviews every changed surface on this repository's real data before merging.

## Out of Scope

- New Pipeline features or data the snapshot does not have.
- Changing what a gate requires, or how Stints run.
- The Overview, the top bar and the Needs you queue (audited in M18), except where the detail panel reuses their parts.
