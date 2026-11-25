<!-- SPDX-License-Identifier: Apache-2.0 -->
# Overview polish

Status: ready-for-agent

Milestone: M18 · Overview polish. See `docs/plan.md`, `GLOSSARY.md`, ADR 0020, ADR 0022 and `docs/agents/frontend.md`.

## Problem Statement

On 2026-11-24 the coordinator audited the Overview and every surface it opens: the Needs you queue with its six item panels, Create work item, and the shell shown on Overview (top bar, Settings menu, Project setup, Jump to, the connection screen). The audit used this repository's real data at 1440, 1024 and 390px in both languages and both colour schemes, plus the rich browser fixture with every attention kind. The maintainer marked every finding to be fixed.

**Broken or misleading.**

- **A1.** On Overview, opening a work item from Jump to or from a Needs you item only adds `item=` to the URL. Nothing opens until the user switches to Pipeline, where the panel then appears unexpectedly. `Board` passes `openWorkItem` to `CommandPalette` and `NeedsYouQueue` without switching view.
- **A2.** The Settings menu shows "Project setup 5/5" while Project setup shows 6/6. The top bar counts five snapshot flags of its own; the guide counts the server's six checks, so the warning dot can disagree with the guide.
- **A3.** "Where the work is" counts every unmerged work item. On this repository 17 of its 19 items belong to shipped milestones, so the card says the work is in Review (12) and Implement (7).
- **A4.** Milestone progress counts work items. M15 has one work item with 5 of 6 tickets resolved, and shows 0%.
- **A5.** The milestone card's "Stints this week" shows the whole project's count.
- **A6.** The activity card reads "Last 7 days · 0 stints · No stints in the last 7 days" and then lists five stints from six weeks earlier.
- **A7.** Durations use minutes only: "Waiting 49065 min", "300 min elapsed".
- **A8.** In Chinese, memory proposal titles stay English ("Memory proposal: AGENTS.md"), and a login item shows the Chinese instruction and the English details together.
- **A9.** The permission block says "工作段: stint" where every other surface says "Stint".

**Overview layout and visuals.**

- **B1.** The fixed three-column grid leaves holes when cards are omitted (on this repository the second row at 1440px holds one card), and stretches cards to the row height: "Where the work is" is 483px tall around 175px of content, and Next up shows about 250px of empty gradient.
- **B2.** The milestone card's eyebrow and title sit 4px lower than its neighbours' (a `CardHeader` nested in `CardContent`).
- **B3.** Stage bars use violet for running, which `frontend.md` reserves for selection and focus. The legend is grey `●` and `▨` glyphs that match no bar, "Other" (the majority) has no legend entry, grey bars on a grey track nearly vanish in dark mode, and the waiting hatch is loud.
- **B4.** Without a target date, "Progress" hangs alone under the bar; "of milestone completed" repeats it. More and shipped milestones use native `<details>` with the browser triangle instead of `ui/Disclosure`.
- **B5.** The connection status takes its own 47px row with a 4px dot; going offline only recolours that line.
- **B6.** The pending-permissions banner is a bare full-bleed text strip with no icon or affordance, wider than the 1320px content.
- **B7.** Needs you rows all share one icon, generic titles omit the work item, and every row opens the top of the queue.
- **B8.** Agent avatars all read "C" for Codex, Claude Code and custom agents. Times are full locale date-times with seconds.
- **B9.** The empty state is a small title and two stacked buttons in a 1320px card, with no explanation; its Pipeline button leads to an empty board.
- **B10.** Hard-coded values: `text-[66px]`, `tracking-[-.08em]`, `font-[650]`, `text-[28px]`, `min-h-[315px]`, `text-[#29243c]`, `text-white`; the overview colour tokens are hex, not OKLCH.
- **B11.** The top bar (max 1500px) and content (max 1320px) edges do not line up.
- **B12.** The Needs you badge is 16px with 9px text, so two digits overflow. Neighbouring icon buttons use different variants. The logo is a text glyph.
- **B13.** The big percentage and counts do not roll, and progress does not fill (`spring.number`).

**Needs you queue.**

- **C1.** Items repeat themselves: the kind label, the title, a second "Permission request" heading, the agent twice and the stint id twice, before any action.
- **C2.** Item layout order differs by kind; checkpoint warnings put their card before the work item link and metadata.
- **C3.** Only permissions have their own icon; gate, stale approval, login, memory and handoff all use a question mark.
- **C4.** A ready gate embeds the whole `GateView`, including the project's warnings again in every gate, and its buttons have no spacing container.
- **C5.** The memory proposal card is headed "Accept memory proposal", the same words as its button.
- **C6.** Checkpoint warnings colour the whole section, leave the reasons loose after the property row, run full 40-character hashes together, and show both explanations.
- **C7.** Answering shows a toast and an inline status; errors appear in the footer, far from the item, as well as in a toast.
- **C8.** The footer always holds "Enable browser notifications", which costs space at 390px.
- **C9.** Items keep snapshot order; permissions that block an agent are not first.
- **C10.** "Reopen 工单" for a stale Tickets approval reads as reopening a ticket.

**Dialogs and the shell.**

- **D1.** The entry says "New work item" while the dialog title and submit say "Create work item". The dialog has no close button and no description.
- **D2.** Inputs and textareas are styled through parent selectors (`[&_input]`, `[&_textarea]`) in Create work item and Needs you; `src/ui/` has no Input or Textarea.
- **D3.** Jump to shows the Esc hint twice; its group headings use uppercase and wide tracking, which suit neither language.
- **D4.** Project setup's status icons are empty circles beside checkboxes and read as radio buttons.

**Code.**

- **E1.** `Overview.tsx` is one 570-line component; the more and shipped milestone lists are duplicated; the stage maximum is recomputed per row; Next up looks its milestone up twice.
- **E2.** "Done" has three definitions: `workItemDone`, the stage card's `!merged`, and the board's. A3 and A4 come from this.
- **E3.** Create work item classifies errors by matching English messages and repeats the translation reduce three times.
- **E4.** Five catalog keys are unused, including `viewNavigation.description` ("Overview is being built").
- **E5.** The queue duplicates the login item's markup and picks the kind label through a six-level ternary.

## Solution

Fix every finding above. Decisions, recommended by the coordinator from the developer's point of view:

1. **In flight.** A work item is in flight when it is not merged and its milestone is not shipped. "Where the work is" counts only work items in flight. One helper in `overview-data.ts` owns this and `workItemDone`, and both cards use it.
2. **Milestone progress counts tickets.** Each ticket is one unit; a work item without tickets is one unit, done when the work item is done. A merged work item counts all its units done. The card keeps a "Work items 0/1" row. When tickets are unavailable it keeps the "may be incomplete" note.
3. **Activity.** The chart keeps "Last 7 days". The list below becomes "Recent stints" with relative times ("2 hours ago", "6 weeks ago"; full time in a title), and stays when the week is empty. An empty week collapses the chart to its one-line message.
4. **Needs you rows on Overview** open the queue scrolled to that item, with focus on it and a brief highlight. The queue is where every kind can be answered, and each item already links to its work item.
5. **A ready gate in the queue** shows a compact summary: the stage, conditions met (x/y) with the unmet ones listed, the Approve button when ready, and "Open gate" to the work item's gate in the detail panel. The full `GateView` stays in the detail panel.

## Implementation Decisions

- Durations use one helper with minutes, hours and days ("3 h 12 min", "34 days"), in both catalogs, used by Overview and Needs you.
- The top bar's setup count comes from the same checks as Project setup. If the snapshot lacks them, the server adds them; never count two lists.
- Overview uses a layout that does not leave holes when cards are omitted (for example two content-sized columns at 769px and wider and a span rule for the wide cards), and cards size to their content. The audit's screenshots at 1440, 1024 and 390px with real data are the before state.
- Charts and progress use status tokens (`running`, `attention`, muted) rather than violet; legends use real swatches that match the bars, including Other.
- Add `ui/Input` and `ui/Textarea` from shadcn's source as `frontend.md` describes, and use them in Create work item and the Needs you answers.
- Agent avatars show distinguishable initials or marks per agent (for example "Co", "Cl", "An"), with the agent identity colours kept.

## Testing Decisions

- jsdom tests cover A1 (Jump to and a Needs you link open the work item from Overview), A2, the in-flight and progress helpers, the duration helper, and the queue's ordering and scroll-to-item.
- The Overview browser cases use both real-shaped data (many shipped milestones, empty week, no attention) and the rich fixture, at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark at 1440 and 390px, and assert no grid hole wider than one card, no card taller than its content plus padding, and the layout checks.
- The coordinator reviews every changed surface on this repository's real data before merging.

## Out of Scope

- Pipeline and the work item detail panel, except where A1 needs them; they get their own audit.
- New Overview cards or data the snapshot does not have.
