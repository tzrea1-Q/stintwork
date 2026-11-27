<!-- SPDX-License-Identifier: Apache-2.0 -->
# 08 — Appearance and motion settings

Status: resolved
Blocked by: none

## What to build

The maintainer could not walk the exit tickets in both colour schemes or with reduced motion: the colour scheme only follows `prefers-color-scheme` (ADR 0019) and reduced motion only follows `prefers-reduced-motion` (ADR 0022), and the Settings menu offers neither. The maintainer asked for these options in the UI on 2026-11-26.

- The Settings menu gains two radio groups below Language, in the same style:
  - **Appearance**: System, Light, Dark.
  - **Motion**: System, Full, Reduced.
- Both default to System, which keeps today's behaviour. They are per-browser viewer preferences kept in `localStorage` like the language (`stintwork.theme`, `stintwork.motion`), with every read and write guarded. They are not project state (ADR 0006) and nothing is sent to the server.
- The effective colour scheme sets `.dark` on `<html>`. Under System it still follows `prefers-color-scheme` live.
- The effective motion setting is the single source for reduced motion:
  - `useReducedMotionSafe` returns it.
  - `MotionConfig` uses `always`, `never` or `user`.
  - Every CSS rule written for `prefers-reduced-motion: reduce` applies when the effective setting is reduced, including Reduced chosen under an OS with no preference, and does not apply under Full.
- A new decision record supersedes in part ADR 0019 (no theme switch) and ADR 0022 (reduced motion from the operating system only). `docs/agents/frontend.md` follows it.

Scope: the Settings menu, theme and motion preference modules, `src/ui/motion.ts`, `MotionRoot`, CSS reduced-motion rules, both catalogs, the new ADR, status lines of ADR 0019 and 0022, `docs/agents/frontend.md`, and tests.

## Acceptance criteria

- [x] jsdom tests cover:
  - both groups render with System checked by default and the stored choice checked after a reload;
  - Dark and Light override the system scheme, and System follows a live system change;
  - Reduced and Full override the system motion preference in `useReducedMotionSafe`;
  - unreadable or invalid storage falls back to System.
- [x] A browser spec at 1440 and 390px in `en` and `zh-CN` checks:
  - choosing Dark under an emulated light scheme sets `.dark`, survives a reload, and System returns to the emulated scheme;
  - choosing Reduced under `reducedMotion: "no-preference"` stops transforms while fades still play, and Full under `reducedMotion: "reduce"` restores them;
  - the menu fits the viewport without overflow.
- [x] The existing browser suite still passes.

## Comments

**Coordinator, 2026-11-26:** Implemented by Codex in three rounds (initial build; Node-safe `appearance.ts` and three existing unit tests moved to `data-motion`; a race in `e2e/appearance.spec.ts` where the sampler caught the previous menu's exit). A throwaway probe confirmed that under Reduced the menu only fades (`transform: none`, opacity 0.53 → 1). Verification on 3c0d05b:

- `pnpm build`, `pnpm typecheck`, `pnpm format:check` pass; `pnpm lint` shows the same 13 warnings and 8 infos as before the change.
- `pnpm --dir packages/web test`: 100 files, 1035 tests passed.
- Full browser suite (4 workers): 559 of 560 passed. `motion-board` "board snapshot continuity at 1440px" failed under parallel load and passed 4/4 alone with `--workers=1`. `e2e/appearance.spec.ts` passes at 1440 and 390px in `en` and `zh-CN`.
- Screenshots reviewed: the Settings menu at 1440px `zh-CN` light and 390px `en` dark fits the viewport and matches the Language group.
