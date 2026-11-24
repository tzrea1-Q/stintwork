<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Animated overlays

Status: ready-for-agent
Blocked by: 01

## What to build

Animate every overlay inside its `src/ui/` wrapper:

| Overlay | Enter | Exit |
|---|---|---|
| Dialog, centred | Scales from `scale.dialog` and fades in on `spring.surface`, through `blur.surface` | `tween.dismiss` |
| Dialog backdrop | Dims on `tween.overlay` | Clears on `tween.overlay` |
| Sheet (and Dialog's `left` and `right` placements) | Slides from its edge on `tween.sheet` | `tween.dismiss` |
| Popover, DropdownMenu, Select | Grow from the trigger through the Radix transform-origin variable, from `scale.popover` on `spring.pop` | Quicker |
| Tooltip | From `scale.tooltip` | A warm tooltip, within 500ms of the last, shows and hides at once |
| Jump to (cmdk) | `tween.menu` from `scale.palette` | No slower than it opened |

Use `asChild` and `forceMount` under `AnimatePresence`, so focus trap, Escape, outside click and nested dismissal behave as before.

Align Sonner toasts with `tween.dismiss` where Sonner allows it. Needs you uses Sheet.

Scope: Dialog, Sheet, Popover, Tooltip, DropdownMenu, Select, `CommandPalette.tsx`, Sonner, their tests and `e2e/motion.spec.ts`.

## Acceptance criteria

- [ ] Each overlay is mid-flight early, at rest afterwards, and fully gone within its exit token plus 100ms.
- [ ] Anchored overlays grow from their trigger's side at 1440 and 390px.
- [ ] Focus moves into a Dialog at once and returns to its trigger after the exit. Nested overlays dismiss only the topmost.
- [ ] Opening then closing quickly ends closed with no stray portal content. Closing then opening quickly ends open.
- [ ] Under reduced motion, overlays fade without scale or travel.
- [ ] Existing overlay unit tests and the full browser suite pass. `motion.spec.ts` covers every overlay listed above.
- [ ] Comments include the coordinator's normal-speed and 10%-speed review on real data at 1440 and 390px in both languages.
