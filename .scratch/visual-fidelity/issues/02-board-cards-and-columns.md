<!-- SPDX-License-Identifier: Apache-2.0 -->
# 02 — Board cards and columns

Status: resolved
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

## Comments

**Coordinator, 2026-11-12:** Verification.

- Work item card titles use the new `--type-item-title` token (13px/620). State tints are kept. A status chip shows only for running, waiting, blocked, or stopped in the current stage; the repeated "No active stint" and "Inferred" rows are gone. Inference is the agent avatar's tooltip, a focusable button whose accessible name includes "Inferred".
- Codex review caught a stopped chip that described an old stint after the item advanced or shipped. The chip now requires an unmerged item, no active stint and a last stint stopped in the current stage, with tests for each case.
- Empty and populated columns share one header: icon chip, stage name, right-aligned count, and the "N running · N waiting" line. The polish pass after the comparison with D always shows that line, as D does, and sets the stage name to 13px/600.
- The final comparison on the rich fixture caught slugs and milestone tags breaking mid-word in narrow columns. Slugs now truncate with `data-truncate` and a full-text `title`, and the milestone tag stays on one line.
- Merged cards no longer carry a Shipped chip; they sit in the collapsed Shipped row.
- Side-by-side with Variant D in a real browser at 1440 and 390px, en and zh-CN, on this repository's data and the rich fixture (the rich cases' full-page screenshots come from the e2e run).
- Final run on `main` at 96d6e7e (tickets 02–05 plus two polish passes merged): `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3462 passed) and `pnpm build` passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 506 passed.
- Earlier per-branch runs had isolated `ECONNRESET` on the e2e API request and server timing failures while four suites and Codex runs shared the machine. The unit suite and the e2e suite, each rerun alone on `main`, passed in full.
