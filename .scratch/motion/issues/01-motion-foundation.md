<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Motion foundation

Status: resolved
Blocked by: none

## What to build

Before you start, the coordinator adds `motion@14.14.0` (an exact pin) and removes `tw-animate-css`.

Create `packages/web/src/ui/motion.ts` with the tokens in `docs/agents/frontend.md` § Motion:

- springs as `{ type: "spring", visualDuration, bounce }`;
- tweens as `{ duration, ease }`;
- `scale`, `shift`, `blur` and `stagger`.

Mirror the tweens and curves as `--motion-*` custom properties in `tokens.css`, with a sync test.

Add `MotionRoot`, which wraps `LazyMotion` (`domMax`) and `MotionConfig reducedMotion="user"`, and render it in `main.tsx`.

Add press feedback to Button, Toggle, ToggleGroup items and Checkbox:

- `spring.press`, at scale 0.97, on pointer down and on Enter or Space;
- never on hover;
- none when the control is disabled.

Move colour transitions onto `tween.color`, and replace `transition-all` with specific properties. Animate Disclosure height and chevron (see the spec). Make Progress and SegmentedProgress fill on `spring.number`.

Set up the tests:

- `MotionGlobalConfig.skipAnimations = true` in `src/test-setup.ts`;
- `reducedMotion: "reduce"` for the existing Playwright projects;
- `e2e/motion.spec.ts` with a frame-sampling helper, covering press, disclosure and progress.

Scope: `src/ui/motion.ts`, `src/ui/MotionRoot.tsx`, `main.tsx`, `styles/tokens.css`, `style.css`, Button, Toggle, ToggleGroup, Checkbox, Disclosure, Progress and SegmentedProgress, their tests, `test-setup.ts`, `playwright.config.ts` and `e2e/motion.spec.ts`.

## Acceptance criteria

- [ ] `motion.ts` values equal the `frontend.md` table, and the sync test fails if `tokens.css` drifts.
- [ ] Pressing a Button by pointer or keyboard scales it to 0.97 and back. Hovering never scales it.
- [ ] A Disclosure's height animates open and closed in Chrome. Its `open` attribute and keyboard toggling are unchanged.
- [ ] Under reduced motion, press and disclosure run no transform or height animation.
- [ ] The web bundle grows by at most 45 kB gzip. Comments record the sizes.
- [ ] `pnpm test` and the full `pnpm test:e2e` pass. `motion.spec.ts` covers press, disclosure and progress at 1440 and 390px.

## Comments

**Coordinator, 2026-11-24:** Verification.

- Codex implemented it in five rounds. Coordinator review found and got fixed:
  - Press got stuck at 0.97. Wrapper handlers, such as a Tooltip trigger's, replaced the press handlers through Slot, and a release outside the button was never seen. Handlers now compose, and a window `pointerup`, `pointercancel` or `visibilitychange` releases the press.
  - Only `ui/Disclosure` animated. About ten raw `<details>` elements, including Agents by stage, did not. The height rule is now global in `@layer base`.
  - Under reduced motion, the reduced-motion rule set `rotate: none` and hid the chevron's open state. Now only the transition is removed.
  - `motion.test.ts` read files relative to the working directory, so it failed from the repository root.
  - A duplicate CSS block was removed.
  - `transition-all` in Item and ScrollArea was replaced. Tabs is left for ticket 03.
- **Bundle (gzip): over the acceptance budget.** Main's JS was 305,755 bytes. The initial chunk is now 321,492 (+15.7 kB). Motion's `domMax` features load asynchronously as a separate chunk of 35,778 bytes. The total of +51.5 kB exceeds the 45 kB in the acceptance criteria. Dropping to `domAnimation` would remove the layout animation that tickets 03 and 04 need. The coordinator accepted the deviation, since the app is served locally and the blocking load grew by 15.7 kB, and reported it to the maintainer.
- Real browser on this repository's data, in a git clone, at 1440 and 390px in en and zh-CN:
  - Agents by stage opens through 18 frames of rising height (31→271px at 1440px).
  - Pressing Mark as shipped scales it to about 0.969, and it returns to `none` after a release off the button.
  - With reduced motion, the height jumps and no transform runs.
  - The page has no horizontal overflow.
- Final runs:
  - `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck` and `pnpm build` passed.
  - `pnpm test`: 3,482 passed and 2 failed. `index.test.ts` "watching discovers project directories…" fails on `main` too. The `work-item-files` watcher test is load-only; it passes 19/19 when rerun alone.
  - `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e`: 519 passed, including `motion.spec.ts` at 1440 and 390px.
