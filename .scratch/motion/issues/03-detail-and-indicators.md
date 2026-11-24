<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Detail panel and gliding indicators

Status: resolved
Blocked by: 01

## What to build

**The docked panel:**

- It slides in from the right on `tween.sheet` and leaves on `tween.dismiss`, moving by transform.
- Full screen expands and collapses with layout animation on `spring.layout`. The identity header and tabs do not stretch.
- Resizing by drag or keyboard stays live, with no animation.
- The board-side reflow belongs to ticket 04.

**Indicators.** These glide on `spring.selection` through a shared `layoutId`:

- the Tabs indicator, in the line and default variants;
- the top bar's Overview and Pipeline pill;
- ToggleGroup's selected item, including the roadmap editor's status;
- the roadmap editor's selected milestone.

**Tab panels.** The new panel enters at once with `shift.panel` and `blur.swap` on `tween.swap`. The old panel leaves immediately, so switching never waits. Reordering milestones in the roadmap editor animates by layout.

Scope: `WorkItemDrawer.tsx`, `ui/Tabs.tsx`, `ui/ToggleGroup.tsx`, `TopBar.tsx`, `RoadmapEditor.tsx`, their tests and `e2e/motion.spec.ts`.

## Acceptance criteria

- [ ] Opening, closing and toggling full screen are mid-flight early and at rest afterwards. The page has no horizontal overflow on any sampled frame at 1440 and 1024px.
- [ ] Indicators pass through intermediate positions between two tabs. Keyboard selection animates like the pointer.
- [ ] Rapid tab switching ends on the last tab chosen, with its content shown and no blank frame longer than the swap token.
- [ ] Under reduced motion, indicators move instantly and the panels fade only.
- [ ] The full browser suite passes. Comments include the coordinator's normal-speed and 10%-speed review on real data.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it. Coordinator review found and got fixed:
  - The indicator rest offset was measured exactly 1px from the tab. The test now uses the designed geometry, and the at-rest look matches `main`.
  - To make a press test pass, Codex had added a header that counter-moved against the panel during entry; it was reverted. The real cause was the test pressing mid-entry, which is solved by `waitForRest`.
  - On integration, the docked close kept `?item=` until its exit ended; see ticket 02.
- **Final runs** on `motion-integration` (02, 03 and 04 merged):
  - `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed.
  - `pnpm test`: 3,521 passed and 1 failed. The failure is `index.test.ts` "watching discovers project directories…", which predates this branch and also fails on `main`.
  - `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 534 passed and 4 failed. The four were one Needs you case, one `motion-board` case and two `motion-detail` cases. All four passed in two serial reruns (53/53 each): the frame-timing and long-task checks are sensitive to load from parallel workers.
- **Real browser** on this repository's data, in a git clone, motion on, at 1440px in en and zh-CN and at 390px. Sampled frame by frame:
  - the docked panel slides in by transform and reaches rest in about 520ms;
  - board cards glide by position, their width snapping (244→254px) with no stretching;
  - Create work item scales from 0.92 and fades through blur, reaching rest in about 460ms;
  - the Settings menu grows from its trigger with a slight overshoot (1.0025) on `spring.pop`;
  - at 390px the Sheet slides from x=291 to 16 in about 470ms;
  - no horizontal overflow at any width.
