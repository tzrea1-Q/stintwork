# 05 — Chinese review and ship

Status: ready-for-agent
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

- [ ] Component tests in Chinese:
  - review decisions and ship actions are findable by Chinese accessible names;
  - the push confirmation is shown in Chinese and still requires explicit confirmation;
  - diffs, commands and finding text render verbatim.
- [ ] Existing English tests pass unchanged, and the catalog completeness test passes.
- [ ] All checks pass.
