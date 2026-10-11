# 11 — Release preparation

Status: ready-for-human
Blocked by: 03, 06, 07, 09, 10

## What to build

v0.1.0 is ready to publish with one deliberate step (spec user stories 67, 68). Prepare the changelog entry and release notes. Rerun the ACP probe for the bundled adapters (AGENTS.md). Do a full manual run: `npx` from the packed tarball in a fresh repo without mattpocock's layout, guided setup, a work item created from the board, and real agents taking it through every stage to shipped (local merge). Fix small defects in separate commits; larger ones become tickets. Publishing to npm and making the GitHub repository public are separate steps, each done only after the maintainer confirms it in the conversation.

## Acceptance criteria

- [x] Changelog and release notes for 0.1.0.
- [x] The full manual run is recorded step by step in Comments.
- [x] The ACP probe results for the bundled adapters are recorded.
- [ ] Publishing and visibility changes happen only with the maintainer's explicit confirmation, recorded in Comments.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Release preparation is done, except the two maintainer decisions.

- **Docs:** Codex wrote `CHANGELOG.md` (0.1.0, unreleased) and `docs/release-notes/0.1.0.md`, then filled in the results below.
- **Package:** the packed-tarball smoke test passes locally and in CI on ubuntu-latest and macos-latest.
- **Full manual run from the installed tarball** (`/tmp/sw-release-pkg`, version 0.1.0) on a fresh project without mattpocock's layout (`greet-cli`, one script, no tracker files):
  1. Setup chip: five proposed changes; Codex and Claude Code skills reported found, Grok can't tell; applied in one commit.
  2. `c` → "Greet by name" with intent; previewed `.scratch/greet-by-name/`; one commit; card in Clarify.
  3. Clarify (Codex): asked three questions and left the spec to the Spec stage (the 06 brief fix holding); answered with a developer note; gate approved.
  4. Spec (Codex): `spec.md` in the work item folder with all answers; gate became ready; approved.
  5. Tickets (Codex): one ticket, `ready-for-agent`, no warnings, committed at the checkpoint; approved.
  6. Implement (Codex): ticket resolved; 5 node:test tests pass (rerun by the coordinator); `greet Ada Lovelace`, `greet` and a blank argument behave as specified.
  7. Review (Codex): "No findings"; the `test` check (default script) passed on head `8d89778`.
  8. Review gate (browser): all five conditions Ready; approved; Merge locally fast-forwarded `main` and recorded the merge (`4d71a95`); worktree removed; board shows "Shipped locally"; 5 stints and the check kept; no warnings.
- **ACP probe** (bundled adapters):
  - Codex 2.1.1: basic, commands, cancel and resume pass; the permission scenario doesn't trigger because Codex runs commands without asking by default.
  - Claude Code adapter 0.88.0: basic, commands, permission and resume pass; cancel wasn't exercised because Claude backgrounded `sleep 60` and ended its turn in 6.5 s, before the probe cancelled. A first attempt was refused by the developer's Claude session limit until it reset.
- **Defects found in M5 release checks, all fixed:** stage briefs inviting Clarify to write the spec (06), Codex skills in `~/.agents/skills` reported missing (08), a cold npm install exceeding the smoke test's 180 s install timeout (09, now 300 s), and CI's git defaulting to `master` (review diff, fixed before M5).

**Waiting on the maintainer:** publishing `stintwork@0.1.0` to npm, and making `tzrea1-Q/stintwork` public. Neither has been done.
