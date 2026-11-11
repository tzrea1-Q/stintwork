Partly superseded by ADR 0019.

# The web UI is built on Radix primitives and checked in a real browser

The brief chose Tailwind, Radix primitives and cmdk, but the web UI never adopted Radix. Overlays each handle focus, Escape and outside clicks themselves. Fixed popover positioning clips the top-bar panels when actions wrap. jsdom tests check behaviour but cannot catch layout bugs. Remote font loading also makes a local-first tool depend on an external service.

Menus, popovers, dialogs, sheets, tooltips and selects use Radix primitives, wrapped once in shadcn/ui-style components in `packages/web/src/ui/`. The wrappers use Tailwind, class-variance-authority, clsx and tailwind-merge. Their source lives in the repo and is maintained there, without the shadcn CLI. Radix owns overlay positioning, focus, Escape and outside-click handling.

Design tokens stay as CSS variables in `packages/web/src/styles/tokens.css` and map into Tailwind's theme. Components style with Tailwind utilities. Both colour schemes come from the tokens. Fonts use the system stack, with no remote font loading.

Playwright checks layout in a real browser at 1440, 1024, 768 and 390px in English and Simplified Chinese. The minimum supported width is 360px. Screenshots are review artifacts, not pixel-by-pixel comparisons. jsdom and Testing Library keep checking behaviour. Every web change follows `docs/agents/frontend.md`.

## Consequences

M8 migrates existing overlays, controls and feature CSS. The shared primitives add a modest amount to the bundle but replace repeated interaction code. Playwright adds a browser test step to CI. There are no native modules in the shipped package; ADR 0007 still holds. Views still read project state and send actions through the existing layer (ADR 0006).
