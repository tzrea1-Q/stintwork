<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Shared patterns

Status: ready-for-agent
Blocked by: 01

## What to build

Use the shadcn CLI to add card, item, empty, progress, skeleton, kbd, tabs, toggle-group, scroll-area, sonner, avatar and separator, and restyle command. Review generated source and keep it in `src/ui/`. Add Stintwork StatusChip, AgentAvatar, IconChip, PropertyRow and SegmentedProgress. Use semantic tokens, 36px round tinted row icons, labels with values and segmented counts. Each component and pattern has a behaviour test appropriate to its semantics.

Scope: Shared components and tests; preserve existing screen behaviour.

## Acceptance criteria

- [ ] Every named component and pattern exists with a behaviour test, including accessible names and keyboard interaction where applicable.
- [ ] Radix retains overlay positioning, focus, Escape and outside-click handling.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
