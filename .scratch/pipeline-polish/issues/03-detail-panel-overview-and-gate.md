<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Detail panel shell, Overview tab and gate

Status: resolved
Blocked by: 01

## What to build

Fix spec findings A3 (panel), A8, A9, A11, C1–C7 and C10, with spec decisions 5–7.

- Header: neutral surface with the title, one meta line (workflow · milestone · stage), and the status and branch chips. Customise workflow moves into a menu button. No lone agent avatar; the agent shows in the properties by display name.
- Footer:
  - exactly one near-black primary, the stage's next step (Start stint; Approve when the gate is ready; Open review in the Review stage);
  - everything else secondary;
  - the next ticket labelled ("Next ticket: 06 · M18 exit");
  - drop the tracker and Esc hint line, keeping the Esc hint only as a tooltip on close.
- Gate:
  - the queue's compact summary (`GateSummary`: conditions met x/y and unmet conditions with reasons), then every condition;
  - one progress bar;
  - no condition repeating the gate's sentence;
  - status chips that stay on the title line at 390px;
  - no ticket line for stages without a ticket condition;
  - empty checkpoint, handoff and warnings collapsed into one line;
  - a disabled Approve with its reason beside it.
- Live Stint:
  - the permission block uses the queue's compact layout (no repeated title, "Permission request" or raw "Stint: stint");
  - the waiting status is plain muted text, not violet;
  - Stop stint uses an icon that does not read as a checkbox (for example `CircleStop`);
  - the recovery card loses its empty padding.
- "Agents by stage" uses `ui/Disclosure`; property labels do not wrap at the docked width.
- Full screen caps the content at a readable width (for example the `page-width` or a 72ch measure for prose), centred.
- Opening the panel from a link or a pointer focuses it without drawing a ring. Keyboard opening still shows focus.

Scope: `WorkItemDrawer.tsx` (header, footer, Overview tab), `GateView.tsx`, `GateSummary.tsx`, `StageAgentRail.tsx`, `StopStint.tsx`, `StintStream.tsx` (live permission block only), `StintRecovery.tsx`, `PermissionAnswer.tsx`, both catalogs, and tests.

## Acceptance criteria

- [x] jsdom tests cover:
  - the footer's single primary per stage (Clarify, Spec, Tickets, Implement, Review, Ship, and a running Stint);
  - the gate summary and the disabled Approve reason;
  - the Customise menu;
  - pointer versus keyboard focus on open.
- [x] Browser cases at 1440, 1024, 768, 390 and 360px in both languages, with light and dark at 1440 and 390px, assert one near-black primary in the panel, gate chips on their title line, a capped content width in full screen, and the layout checks.
- [x] `pnpm test` passes.

## Comments

**Coordinator, 2026-11-25:** Delivered by Codex, with coordinator fix rounds. The final browser run found the footer's Approve kept its own request state, so stale-approval messages and the GitHub refresh no longer appeared in the gate; fix 5 makes the footer and gate share one request state, with a jsdom test. Checked on real data: neutral header with More actions, one primary in the footer, the gate's compact summary with "Blocked by: Tickets resolved" beside a disabled Approve, no ring on pointer or link opens. Full checks on the merged branch: format, lint, typecheck and build pass; `pnpm test` has 3637 passing and one failure that already fails on `main` (`packages/server/src/index.test.ts`, "watching discovers project directories that do not exist at startup"), unrelated to this milestone. The full browser suite passes 555 of 556; the remaining case is `motion-board.spec.ts` "board snapshot continuity at 1440px", which saw long tasks of 58–59 ms only while three workers ran in parallel and passes run on its own (3 of 3).
