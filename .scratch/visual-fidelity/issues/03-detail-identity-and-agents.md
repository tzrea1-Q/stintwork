<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Detail identity and agents by stage

Status: resolved
Blocked by: 01

## What to build

Rebuild the work item detail header as Variant D's identity block: a tinted panel with the 18px title, milestone, workflow and branch chip.

In the property list, show the current stage's agent as one "Agent for this stage" row. Move the per-stage agent selects into a collapsed "Agents by stage" disclosure. Keep every behaviour: inferred markers, disabled states, saving, errors and keyboard access.

Keep the docked panel at 1024px and wider and the Sheet below it. Keep the gate, handoff, stint history and the bounded footer.

Scope: `WorkItemDrawer`, `StageAgentRail` and their tests.

## Acceptance criteria

- [ ] The identity block and property rows match D; the first screen of the panel at 1440x900 shows identity, properties and the gate without scrolling past agent selects.
- [ ] Changing any stage's agent still works from the disclosure, with existing tests passing and a test for the collapsed default.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.

## Comments

**Coordinator, 2026-11-12:** Verification.

- The detail header is D's identity block: a tinted panel with the 18px title, workflow and milestone, an inline Customise link, the agent avatar and a branch chip. There is one "Agent for this stage" row with the inferred marker. Per-stage agent selects are in a collapsed "Agents by stage" disclosure (`<details>`) that keeps disabled states, saving, errors and keyboard access.
- Codex review caught two problems. The active avatar showed the configured stage agent instead of the running stint's agent. The branch chip disappeared between stints; it now falls back to the latest stint's branch and to `stintwork/<slug>` when the item has a worktree.
- The first browser run caught a real regression: the live stint section and its recovery badge had moved below the fold. The live stint section now comes before the property rows. The worktree row is one truncated line with an inline copy button, and the idle "No active stint" chip is gone from the top row.
- A new rich case checks at 1440x900 that the gate heading and its first requirement are visible without scrolling. Existing drawer tests open the disclosure before asserting the agent selects.
- Side-by-side with Variant D in a real browser at 1440 and 390px, en and zh-CN, on this repository's data and the rich fixture (the rich cases' full-page screenshots come from the e2e run).
- Final run on `main` at 96d6e7e (tickets 02–05 plus two polish passes merged): `pnpm format:check`, `pnpm lint` (11 existing warnings), `pnpm typecheck`, `pnpm test` (3462 passed) and `pnpm build` passed. `PLAYWRIGHT_CHROME_CHANNEL=chrome PLAYWRIGHT_PORT=4600 pnpm test:e2e`: 506 passed.
- Earlier per-branch runs had isolated `ECONNRESET` on the e2e API request and server timing failures while four suites and Codex runs shared the machine. The unit suite and the e2e suite, each rerun alone on `main`, passed in full.
