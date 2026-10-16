# 07 — M8 exit

Status: ready-for-human
Blocked by: 06, 08, 09, 10

## What to build

The maintainer walks every screen from ticket 06 at 1440, 768 and 390px in `en` and `zh-CN`. Check layout, long content, keyboard actions and overlay placement. Include the command palette and brief preview. Record the revision, screen coverage, widths, languages and pass or fail in Comments.

Check CI's complete browser suite at 1440, 1024, 768 and 390px in both languages, including both colour schemes at 1440 and 390px. Set M8 shipped in `.stintwork/roadmap.md` only after CI is green and the maintainer finds no layout bugs. Otherwise keep M8 active and record the blockers for correction and another walk-through.

M7 stays active. go-public 04 can start only after this exit passes and its own ticket 03 is resolved; go-public 01–03 do not wait for this milestone.

## Acceptance criteria

- [ ] Comments link a green CI browser-suite run and its revision, covering all screens at 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments record the maintainer's walk-through of every screen, command palette and brief preview at 1440, 768 and 390px in both languages, with no layout bugs found.
- [ ] M8 is set to `shipped` only after both results pass. A failure leaves M8 active with blockers recorded and go-public 04 waiting.
- [ ] M7's status and go-public 04's local `Blocked by: 03` line are unchanged; the cross-work-item gate follows the recorded M8 exit result.

## Comments

**Coordinator, 2026-10-13:** The maintainer's walk-through found the Setup popover design unacceptable. Ticket 08 replaces it with a dialog organised by check; M8 exit now waits for both 06 and 08.

**Coordinator, 2026-10-15:** The maintainer asked for a simpler top bar during the walk-through. Ticket 09 moves language and project setup into Settings, project warnings into Needs you, and milestone switching into the board toolbar; M8 exit now waits for 06, 08 and 09.

**Coordinator, 2026-10-16:** The real-project Project setup review found unclear guidance and a pre-selected destructive tracker replacement. Ticket 10 preserves existing trackers by default and redesigns the dialog; M8 exit now waits for 06, 08, 09 and 10.
