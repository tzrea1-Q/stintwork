<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Board cards and columns

Status: ready-for-agent
Blocked by: 01

## What to build

Bring the Pipeline board to Variant D:
- Cards keep their state tints, with the title at the shared card-title size.
- A status chip appears only when it carries information (running, waiting, blocked, stopped). The repeated "No active stint" and "Inferred" rows go; inference becomes the agent avatar's tooltip.
- Stage headers show icon chip, name, count and D's one-line running/waiting stat.
- Empty columns use one header with icon, name and count instead of stacked 64px slivers, so the board stays balanced.

Keep filtering, URL state, keyboard behaviour, long-name access and the collapsed Shipped row.

Scope: `WorkItemCard`, `Column`, the board toolbar spacing and their tests. The detail panel belongs to 03.

## Acceptance criteria

- [ ] A card with no stint and no attention shows title, slug, milestone, agent avatar and ticket progress, with no empty-state rows.
- [ ] Inference is still discoverable by pointer and keyboard (avatar tooltip with accessible name).
- [ ] Empty and populated columns align to D's header layout at every width; long names stay accessible.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.
