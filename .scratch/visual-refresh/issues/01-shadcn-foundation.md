<!-- SPDX-License-Identifier: Apache-2.0 -->
# 01 — Shadcn foundation

Status: ready-for-agent
Blocked by: none

## What to build

Set up `packages/web/components.json` with style `radix-nova`, the Radix variant of shadcn’s current default style, components alias to `packages/web/src/ui/` and utils alias to the existing `cn`. CLI v4 rejected `new-york` together with a separate base key on 2026-11-10. Stay on React 18. Migrate `@radix-ui/react-*` to unified `radix-ui`; do not adopt Base UI. The coordinator installs packages because the agent sandbox has no network. Own the component source here; review future `add` changes with `--diff` or `--dry-run`.

Use the shadcn names and foreground counterparts, `chart-1`–`chart-5`, `--radius`, plus `running`, `attention`, `blocked`, `success`, `stopped` and agent identity colours with soft variants. Convert the prototype palette to OKLCH; design dark separately. Bundle Geist and Geist Mono via `@fontsource-variable/*` with CJK system fallbacks. Set `.dark` on `<html>` from `prefers-color-scheme`, without a theme switch or remote font loading.

Restyle existing `src/ui/` Button as pill variants, Badge as soft status chip, Dialog, Sheet, Popover, DropdownMenu, Select, Tooltip and Checkbox. Update behaviour tests. Keep screen layouts intact.

Scope: Foundation, existing primitives and their tests; no screen layout changes.

## Acceptance criteria

- [ ] Configuration, unified Radix, tokens, bundled fonts and system dark class follow ADR 0019; Comments record coordinator package installation.
- [ ] Existing primitive behaviour tests pass, including keyboard, focus, Escape and outside clicks where applicable; screens retain their layouts.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
