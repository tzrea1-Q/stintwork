<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Shadcn foundation

Status: resolved
Blocked by: none

## What to build

Set up `packages/web/components.json` with style `radix-nova`, the Radix variant of shadcn’s current default style, components alias to `packages/web/src/ui/` and utils alias to the existing `cn`. CLI v4 rejected `new-york` together with a separate base key on 2026-11-10. Stay on React 18. Migrate `@radix-ui/react-*` to unified `radix-ui`; do not adopt Base UI. The coordinator installs packages because the agent sandbox has no network. Own the component source here; review future `add` changes with `--diff` or `--dry-run`.

Use the shadcn names and foreground counterparts, `chart-1`–`chart-5`, `--radius`, plus `running`, `attention`, `blocked`, `success`, `stopped` and agent identity colours with soft variants. Convert the prototype palette to OKLCH; design dark separately. Bundle Geist and Geist Mono via `@fontsource-variable/*` with CJK system fallbacks. Set `.dark` on `<html>` from `prefers-color-scheme`, without a theme switch or remote font loading.

Restyle existing `src/ui/` Button as pill variants, Badge as soft status chip, Dialog, Sheet, Popover, DropdownMenu, Select, Tooltip and Checkbox. Update behaviour tests. Keep screen layouts intact.

Scope: Foundation, existing primitives and their tests; no screen layout changes.

## Acceptance criteria

- [x] Configuration, unified Radix, tokens, bundled fonts and system dark class follow ADR 0019; Comments record coordinator package installation.
- [x] Existing primitive behaviour tests pass, including keyboard, focus, Escape and outside clicks where applicable; screens retain their layouts.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-10:** Installed `radix-ui` 1.8.1, `@fontsource-variable/geist` 5.2.5, `@fontsource-variable/geist-mono` 5.2.5 and `tw-animate-css` 1.4.0 in `packages/web` (the agent sandbox has no network), and removed the six `@radix-ui/react-*` packages after the imports moved to `radix-ui`. The shadcn CLI is not a dependency; it runs as `pnpm dlx shadcn@4.23.0`. CLI v4 rejects `new-york` with a separate base key, so `components.json` uses `radix-nova`; ADR 0019, the frontend guide, the spec and this ticket now say so.

**Coordinator, 2026-11-10:** Verification.

- The first browser run failed 320 of 432 cases with "Overlay outside 16px viewport gutter". Cause: the new tokens dropped the `--spacing` mapping while the root font size became 14px, so Tailwind's spacing unit shrank to 3.5px. Restored `--space-unit: 4px`; `tokens.test.ts` now guards the mapping and the contrast pairs.
- `codex review --base main` found two P2 issues: the docs named `new-york`, and light destructive contrast was about 4.1:1. Both fixed; destructive and every status `-foreground` on `-soft` pair now reach at least 4.7:1 in light and 6.6:1 in dark.
- Screenshot review found a floating Sheet with square outer corners and wrapped pill buttons turning into stadium shapes. Fixed: Sheets keep `rounded-2xl`; Button radius is per size (14, 16, 20px) so single-line buttons stay pills.
- Final run on the branch: `pnpm format:check`, `pnpm lint` (existing 11 warnings, 7 infos), `pnpm typecheck`, `pnpm test` (3359 passed) and `pnpm build` pass; `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` passes 432 of 432 at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark.
- Coordinator review of screenshots at 1440 and 390px in both languages and both schemes: grey canvas, near-black pill primary, Geist type and the dark palette apply; screen layouts are unchanged, as scoped. Raw label/value structure in the drawer and dialogs stays for tickets 05 and 07.
