<!-- SPDX-License-Identifier: Apache-2.0 -->
# The web UI adopts shadcn/ui and a new visual language

On 2026-11-10 the maintainer found the shipped UI rough and chose Variant D of the visual prototype. It combines Variant B's top pill navigation and Overview with Variant A's Pipeline board and docked work item detail. The prototype at tag `prototype-visual-v1` is a design reference to rebuild from, never code to import.

The coordinator verified that `pnpm dlx shadcn@latest init -b radix` and `add` work with React 18.3.1, Tailwind 4 and Vite 7 without source fixes. shadcn defaults new projects to Base UI, supports Radix, uses OKLCH tokens and class-based dark mode, and has unified Radix imports in `radix-ui` via `shadcn migrate radix`.

## Decision

Use the shadcn/ui CLI with Radix, not Base UI. Configure `packages/web/components.json` with `radix-nova`, the Radix variant of shadcn’s current default style, component aliases to `packages/web/src/ui/` and the existing `cn` helper. On 2026-11-10, CLI v4 rejected `new-york` together with a separate base key. Generated components are owned in the repo. Review updates with `shadcn add --diff` or `--dry-run` like any other change. Migrate `@radix-ui/react-*` imports to `radix-ui`. Stay on React 18 and the existing `cn`.

Use shadcn token names: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1` through `chart-5`, the corresponding `-foreground` names where shadcn has them, and `--radius`. Add Stintwork `running`, `attention`, `blocked`, `success`, `stopped` and agent identity colours, with soft variants. Use OKLCH values based on the prototype, converting its actual hex and RGB values. Its light canvas is `#f2f2f4`, card `#fff`, primary `#17171c`, accent `#eeebff`, ring `#8a7cf3` and radius `.875rem`. Its separately designed dark canvas is `#0d0d10`, card `#17171b`, primary `#f4f4f6` and ring `#a99afa`. The prototype does not define chart tokens; supply them consistently with the palette. Set `.dark` on `<html>` from `prefers-color-scheme`; add no theme switch in M14.

Bundle Geist and Geist Mono through `@fontsource-variable/*`, with the CJK system fallback stack. No remote font service is used; ADR 0007 still holds.

Use a grey canvas, white rounded cards with large radii and soft shadows, and one near-black pill primary action per surface. Reserve violet for selection and focus. Use soft-tinted status chips with dots, 36px round tinted icon chips in list rows, property rows with icon, muted label and value, segmented progress for counts, a 14px base, 28–32px page titles and large tabular count numerals. Dark colours are designed separately, not inverted.

The top bar has project and branch, centred Overview and Pipeline pill navigation, Jump to (⌘K), Needs you and Settings. There is no sidebar. Overview is home and uses only the existing project snapshot or data derived from it (ADR 0006): milestone progress, work by stage, one focal Next up card, Needs you, running stints and recent stint activity. Omit a card when its data is unavailable. Pipeline shows stage columns and a docked work item detail at 1024px and wider; below that use a Sheet. Keep the existing entry points and behaviour for roadmap editor, setup, customise, review, gate and brief preview, restyled in place. Prototype Stints and Roadmap pages are out of scope. Toasts report action results; offer Undo only for a truly reversible action. None is reversible today.

## Consequences

ADR 0010 is superseded in part: its no-CLI rule, system font stack, token naming and dense, quiet, Linear-like visual language are replaced. Its Radix ownership of positioning, focus, Escape and outside clicks, repo-owned components, Tailwind, jsdom behaviour tests, 360px minimum width and Playwright layout checks at 1440, 1024, 768 and 390px in `en` and `zh-CN` still hold. Test both colour schemes at 1440 and 390px and retain screenshots as review artifacts. ADR 0006's state boundary and ADR 0007's packaging constraints still hold. The generated source and future CLI updates need review and maintenance in this repo.
