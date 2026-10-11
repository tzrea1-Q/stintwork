# 11 — Release preparation

Status: ready-for-agent
Blocked by: 03, 06, 07, 09, 10

## What to build

v0.1.0 is ready to publish with one deliberate step (spec user stories 67, 68). Prepare the changelog entry and release notes. Rerun the ACP probe for the bundled adapters (AGENTS.md). Do a full manual run: `npx` from the packed tarball in a fresh repo without mattpocock's layout, guided setup, a work item created from the board, and real agents taking it through every stage to shipped (local merge). Fix small defects in separate commits; larger ones become tickets. Publishing to npm and making the GitHub repository public are separate steps, each done only after the maintainer confirms it in the conversation.

## Acceptance criteria

- [ ] Changelog and release notes for 0.1.0.
- [ ] The full manual run is recorded step by step in Comments.
- [ ] The ACP probe results for the bundled adapters are recorded.
- [ ] Publishing and visibility changes happen only with the maintainer's explicit confirmation, recorded in Comments.
- [ ] All checks pass.
