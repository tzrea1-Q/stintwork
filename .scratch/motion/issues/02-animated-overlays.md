<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Animated overlays

Status: resolved
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

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it in two stages, A (Dialog, Sheet, Popover and Tooltip) and B (DropdownMenu, Select, Jump to, Sonner, and exits for every Dialog consumer).
- Coordinator review in Chrome found and got fixed:
  - At 390px the Sheet stayed at Motion's `initial` state (opacity 0, translateX(100%)), so taps went through it and dismissed it. Codex could not reproduce the stall in jsdom. Side sheets now enter with a token-timed CSS `translate` transition and exit through Motion.
  - `waitForRest` passed an async predicate to `page.waitForFunction`, which resolved immediately. After the rewrite, it was too strict for centred dialogs (`translate: -50% -50%`).
  - The Jump to timing test was flaky; it now measures inside the page.
  - On integration, closing cleared the selection, `?item=` and `customiseId` only after the exit animation. Reloading or pressing ⌘K right after closing reopened detail or was ignored. Open state now clears at once, and the parent keeps the component mounted for its exit.
- Sonner keeps its own animation where its API does not expose timing; see the comment in `ui/Sonner.tsx`.
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
