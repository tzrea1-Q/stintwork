# 06 — Every screen in the browser suite

Status: ready-for-agent
Blocked by: 05

## What to build

Complete `packages/web/e2e/` coverage following `docs/agents/frontend.md`. Cover board, drawer, Needs you, gate, review, ship, setup, create, roadmap and customise at 1440, 1024, 768 and 390px in `en` and `zh-CN`. Include command palette and brief preview. Run both colour schemes at 1440 and 390px in both languages. Check 360px for minimum-width support.

Exercise loading, empty, error and long content wherever each screen can show them. Include long names and paths, populated attention items, review findings and wide diffs. Use the shared layout-check helper for page overflow, viewport gutters and text clipping. Keep actions reachable and deliberate truncation's full text available.

Fix the layout bugs these cases find in the existing screens. Save screenshots as CI artifacts for review, not pixel comparisons. Keep browser fixtures repeatable and independent of real agent logins and private projects.

## Acceptance criteria

- [ ] Every named screen, command palette and brief preview has passing browser cases at 1440, 1024, 768 and 390px in both `en` and `zh-CN`.
- [ ] Every named screen and overlay passes in both light and dark at 1440 and 390px in both languages; minimum-width checks pass at 360px in both languages.
- [ ] Applicable loading, empty, error and long-content cases pass. Checks find no horizontal page scroll, overlays outside the 16px gutters or accidental text clipping; deliberate truncation exposes full text.
- [ ] Layout bugs found by the suite are fixed, with focused regression coverage. Existing behaviour checks still pass.
- [ ] CI runs the complete `pnpm test:e2e` suite and saves screenshots as review artifacts without pixel comparisons. Comments link the passing run and revision.
- [ ] Comments record actual checks and the coordinator's browser review of every screen at 1440 and 390px in both languages and both colour schemes.

## Comments
