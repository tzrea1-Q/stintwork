# 05 — Chinese review and ship

Status: resolved
Blocked by: 01

## What to build

Make reviewing and shipping readable in Chinese (spec user stories 22–25).

- **Screens to translate:** move their English literals into the `en` catalog unchanged and add `zh-CN` entries:
  - the review overlay;
  - review findings and their decisions (resolved, accepted, sent back);
  - the checks panel and the pull request checks panel, including stale-evidence warnings;
  - memory proposals with accept and reject;
  - ship actions, including the push confirmation;
  - risky-path warnings.
- **Verbatim content:** finding text from agents, diffs, check commands and output, file paths and PR titles stay verbatim. The push confirmation must stay unambiguous in Chinese about what will be pushed and where.

## Acceptance criteria

- [x] Component tests in Chinese:
  - review decisions and ship actions are findable by Chinese accessible names;
  - the push confirmation is shown in Chinese and still requires explicit confirmation;
  - diffs, commands and finding text render verbatim.
- [x] Existing English tests pass unchanged, and the catalog completeness test passes.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-12:** Built by Codex. All four branches were merged into main. The shared catalog conflicts were resolved by keeping every section, and checking that no line from main was lost. On main after the last merge: `pnpm test` passed (127 files, 1761 tests), and `typecheck`, `lint` and `format:check` passed. A browser check on Stintwork's own repo in `zh-CN` passed. The review, checks, memory and ship components were translated. The push and merge confirmations still require explicit confirmation (covered in tests). Stage names returned to the review overlay stay verbatim, because it lacks the workflow context to tell built-in from customised names.
