<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Detail panel and gliding indicators

Status: ready-for-agent
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
