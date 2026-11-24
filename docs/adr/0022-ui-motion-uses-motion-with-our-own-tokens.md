<!-- SPDX-License-Identifier: Apache-2.0 -->
# The UI moves with Motion and one set of motion tokens

Status: accepted 2026-11-24 by the maintainer.

On 2026-11-24 the maintainer found the web UI's motion poor and pointed to Animate UI (`imskyleen/animate-ui`) as a reference. The coordinator checked the M16 build:

- No Dialog, Sheet, Popover, Tooltip, menu or Select has an enter or exit animation. `tw-animate-css` is imported but unused.
- The docked detail panel, full screen and stage rails change size in one frame.
- Tab indicators only fade, and cards jump when they change stage.
- The only motion is colour transitions, loading spinners and pulses, and a progress bar's `transition-all`. No document sets motion rules.

Animate UI's package `@animate-ui/react` needs React 19, while Stintwork is on React 18 (ADR 0019). It is licensed MIT with a Commons Clause that forbids redistributing its components. Stintwork ships its built web app inside an Apache-2.0 npm package, so bundling that code would redistribute it. Animate UI's own runtime, Motion (`motion`, formerly Framer Motion), is MIT, supports React 18 and 19, and drives its motion.

## Decision

The web UI animates with Motion and with CSS transitions. No other animation library is used, and `tw-animate-css` is removed.

Every duration, curve, spring, scale, distance, blur and stagger comes from one token module in `packages/web/src/ui/`. CSS reads the same values as custom properties in `tokens.css`. Each motion role has exactly one token. Feature code never types its own timing.

Overlays and other primitives animate inside their `src/ui/` wrappers. Feature code gets motion by using those wrappers, plus Motion components and tokens for board continuity, live updates and rare moments.

The UI's motion level is expressive, limited by a frequency gate:

- Controls used all day stay short and never delay input: press, tabs, menus, selects, tooltips and Jump to.
- Occasional surfaces take their time: dialogs, sheets, the docked panel, full screen and disclosures.
- Bounce, stagger and rolling numbers belong to rare moments: the first board load, a ticket resolved, a gate approved, a work item shipped, and a new item in Needs you.

Reduced motion is part of every animation. Under `prefers-reduced-motion: reduce`, movement and scale go, and fades and colour changes stay.

Animate UI is a design reference only. Learn from its rules and documentation, but never install, import or copy its code. The rules and tokens live in `docs/agents/frontend.md` § Motion.

This adds to [ADR 0019](0019-the-web-ui-adopts-shadcn-ui-and-a-new-visual-language.md) and supersedes nothing in it. Its components stay on Radix and React 18.
