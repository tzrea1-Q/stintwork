<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Shared patterns

Status: resolved
Blocked by: 01

## What to build

Read the official shadcn registry source with `pnpm dlx shadcn@4.23.0 view <name>` and adapt card, item, empty, progress, skeleton, kbd, tabs, toggle, toggle-group, scroll-area, sonner, avatar and separator into `src/ui/`, and restyle command. Add Stintwork StatusChip, AgentAvatar, IconChip, PropertyRow and SegmentedProgress. Use semantic tokens, 36px round tinted row icons, labels with values and segmented counts. Each component and pattern has a behaviour test appropriate to its semantics.

Scope: Shared components and tests; preserve existing screen behaviour.

## Acceptance criteria

- [x] Every named component and pattern exists with a behaviour test, including accessible names and keyboard interaction where applicable.
- [x] Radix retains overlay positioning, focus, Escape and outside-click handling.
- [x] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [x] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.

## Comments

**Coordinator, 2026-11-10:** Installed `sonner` 2.0.8 in `packages/web`. `shadcn add` could not be used: registry items import `cn` from the npm `cn` package and the sonner item depends on `next-themes`. `pnpm dlx shadcn@4.23.0 view <name>` prints the official `radix-nova` source without installing anything, so every component was rebuilt from that source with the local `cn`, our tokens and radius, and a `.dark` observer instead of `next-themes`. ADR 0019, the frontend guide and this ticket now describe that workflow.

**Coordinator, 2026-11-10:** Verification.

- Added Card, Item, Empty, Progress, Skeleton, Kbd, Tabs, Toggle, ToggleGroup, ScrollArea, Sonner (Toaster exported, not mounted; ticket 07 mounts it), Avatar and Separator, plus StatusChip, AgentAvatar, IconChip, PropertyRow and SegmentedProgress, each with behaviour tests. CommandPalette's cmdk surface is restyled with Kbd hints; its behaviour tests are unchanged in meaning.
- `codex review --base main` found five P2 issues, all fixed with tests that fail without the fix: vertical Tabs now forward `orientation`; SegmentedProgress keeps separate segments up to 40 and unfilled segments are distinct (0/4 shows four segments); PropertyRow takes `fullText` for node values and does not truncate a node without it; ItemGroup children are list items while link items stay links.
- New Biome `useImportType` warnings in generated files were auto-fixed; lint is back to the existing 11 warnings and 7 infos.
- Final run on the branch: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (3394 passed) and `pnpm build` pass; `PLAYWRIGHT_CHROME_CHANNEL=chrome pnpm test:e2e` passes 432 of 432 at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, light and dark.
- Coordinator review of the command palette screenshots at 1440 and 390px: rounded card, accent-tinted selection, small-caps group headings and Kbd hints; the new patterns are not on any screen yet, so their visual review happens in tickets 03–07. Note for ticket 07: the palette input's violet focus outline reads heavy inside the card.
