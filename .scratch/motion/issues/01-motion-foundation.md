<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Motion foundation

Status: ready-for-agent
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
