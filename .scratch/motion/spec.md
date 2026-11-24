<!-- SPDX-License-Identifier: Apache-2.0 -->
# Motion

Status: ready-for-agent

Milestone: M17 · Motion. See `docs/plan.md`, `GLOSSARY.md`, ADR 0019, ADR 0020, ADR 0022 and `docs/agents/frontend.md` § Motion.

## Problem Statement

On 2026-11-24 the maintainer found the web UI's motion poor and pointed to Animate UI (`imskyleen/animate-ui`) as the reference. The coordinator checked the M16 build (`aaaab9e`).

What does not animate:

- **Overlays.** Dialog (Create work item, Edit roadmap, Brief preview, Mark as shipped), Sheet (detail below 1024px, Needs you), Popover, Tooltip, DropdownMenu, Select and Jump to appear and vanish in one frame. `tw-animate-css` is imported in `style.css` and used nowhere.
- **The board.** It changes width in one frame when the docked detail panel opens, closes or goes full screen. Stage rails expand and collapse in one frame. A card that changes stage on a live update jumps to its new column. Cards give no press feedback.
- **Tabs and disclosures.** The tab and pill-navigation indicators only fade, and tab panels cut. Disclosures, which are native `<details>` (Agents by stage, Contents, recovery details), open and close in one frame.

What does animate today: colour transitions on Button and Toggle, `motion-safe:animate-pulse` and `animate-spin` loaders, the Tabs underline's opacity, and Progress's `transition-all`. No document sets motion rules.

Animate UI's package `@animate-ui/react` 2.4.6 needs React 19, and Stintwork is on React 18.3. Its licence is MIT with a Commons Clause, which conflicts with shipping it inside Stintwork's Apache-2.0 npm package. Its runtime, Motion (`motion` 14.14.0, MIT), supports React 18 and 19.

## Solution

Adopt Motion with one token module and the rules in `docs/agents/frontend.md` § Motion (ADR 0022). Then animate the UI at the expressive level, limited by the frequency gate:

- overlays enter from their trigger or edge and leave quickly;
- indicators glide;
- the board and its cards move continuously;
- live updates arrive;
- rare moments (first load, ticket resolved, gate approved, shipped) get bounce, stagger and rolling numbers.

## User Stories

1. As a developer, I want overlays to come from where I opened them and leave quickly, so I keep my place.
2. As a developer, I want the board to move smoothly when the detail panel opens or a card changes stage, so I can follow what changed.
3. As a developer, I want tab and navigation indicators to glide, so the current selection reads at a glance.
4. As a developer, I want live stint output and status changes to arrive visibly but calmly.
5. As a developer, I want finishing a ticket, approving a gate and shipping work to feel rewarding.
6. As a developer who has turned on reduced motion, I want the UI to fade without moving.
7. As a developer, I want motion never to slow down what I do all day.

## Implementation Decisions

- **Runtime.** The coordinator adds `motion@14.14.0`, an exact pin, to `packages/web` and removes `tw-animate-css`. Use `LazyMotion` with `domMax`, needed for layout animation, and `m.*` components. The web bundle may grow by at most 45 kB gzip; record the before and after sizes.
- **Tokens.** Put the tokens in `packages/web/src/ui/motion.ts`, with exactly the values in `frontend.md` § Motion. Mirror them as `--motion-*` custom properties in `tokens.css` for CSS transitions. A unit test parses `tokens.css` and compares it with `motion.ts`.
- **Root.** Add a `MotionRoot` in `src/ui/` that wraps the app in `LazyMotion` and `MotionConfig reducedMotion="user"`. It renders once in `main.tsx`, and also around portalled content if Radix portals escape it.
- **Primitives.** Overlays animate inside their `src/ui/` wrappers. Wrap each Radix part with `asChild` and `forceMount` under `AnimatePresence`, driven by the wrapper's own open state, so `data-state`, focus trap, Escape and outside click keep working. Public props stay the same.
- **Disclosure.** It stays a native `<details>`, so existing tests and semantics hold. Animate its height with `::details-content` and `interpolate-size: allow-keywords` on `tween.disclosure`, and rotate the chevron on the same token. Browsers without support open instantly.
- **Board continuity.** Cards keep a stable `layoutId` (the slug) inside one `LayoutGroup`, so a card changing stage glides across columns. Columns and the board's container animate their layout when the panel opens, closes or goes full screen and when rails expand. Snapshots that change more than 12 cards jump.
- **Rare moments** are marked in code with the token they use: `arrive`, `celebrate` or `stagger`. The first board load staggers once per page load.
- **Tests.** `src/test-setup.ts` sets `MotionGlobalConfig.skipAnimations = true`. `playwright.config.ts` sets `reducedMotion: "reduce"` for the existing projects. A new `e2e/motion.spec.ts` runs with motion on and samples frames through `requestAnimationFrame`, using a shared helper.

## Testing Decisions

- **Unit tests:**
  - tokens match `frontend.md` and `tokens.css`;
  - every overlay wrapper still opens, closes, traps focus and returns it, with animations skipped;
  - press props apply on pointer and keyboard;
  - the >12-card guard;
  - first-load stagger runs once;
  - reduced motion removes transforms.
- **`e2e/motion.spec.ts`**, at 1440 and 390px in `en`, light. For each animated surface in a ticket:
  - an early frame is mid-flight: opacity between 0 and 1, or a transform that is not the identity;
  - the rest frame is the identity, with opacity 1;
  - exits finish within the token plus 100ms;
  - a quick double toggle ends in the right state;
  - the page has no horizontal overflow on any sampled frame;
  - with `reducedMotion: "reduce"`, every sampled transform is the identity while opacity still changes.
- **Existing suites** stay green with `reducedMotion: "reduce"` and no added fixed waits.
- **Coordinator review:** watch each changed surface at normal speed and at 10% playback speed in Chrome DevTools, on this repository's real data, at 1440 and 390px in both languages, and record what was seen.

## Out of Scope

- Page or route transitions between Overview and Pipeline, backgrounds, particle and text effects, and animated icons.
- Drag and drop of cards between stages.
- Upgrading to React 19, and any Animate UI code.
