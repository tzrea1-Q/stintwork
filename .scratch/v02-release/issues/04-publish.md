# 04 — Publish v0.2

Status: resolved
Blocked by: 03

## What to build

Present the verified revision, artifact and dry-run evidence to the maintainer. Publish `stintwork@0.2.0` to npm only after the maintainer explicitly confirms this publication. The maintainer handles login or one-time authentication when needed. Follow the existing release procedure and record the release and tag against the published revision.

## Acceptance criteria

- [x] Comments record the maintainer's explicit confirmation, final revision, artifact identity and publication result; no confirmation means no publish.
- [x] npm serves 0.2.0 with the expected metadata and matching package integrity or shasum; a registry-installed smoke check starts the server and loads the board.
- [x] The release tag, date, changelog and notes match the published revision and actual publication; CI evidence is linked.

## Comments

**Coordinator, 2026-11-10: published.** The maintainer explicitly confirmed publication ("发布") after reviewing the revision, artifact, contract and dry-run evidence. The maintainer signed in to npm and completed the two-factor web authentication themselves; the coordinator did not handle credentials. The maintainer ran `npm publish --registry https://registry.npmjs.org` from the clean `33125f8` checkout (the default npm registry on this machine is a mirror). Output: `+ stintwork@0.2.0`.

- **Registry:** `npm view stintwork@0.2.0` shows version 0.2.0, `latest` = 0.2.0, the shasum and integrity above, repository `git+https://github.com/tzrea1-Q/stintwork.git`, homepage `…#readme` and bugs `…/issues`. Published revision `33125f8` (tag `v0.2.0`); `stintwork@0.2.0` on registry.npmjs.org, shasum `bf6e2ef16c5de3083af02725ce27278115f466fb`, integrity `sha512-Ozb9tWGffg862X5TUIa42a+cRzfjOqfnLB2YURBexxm5K4xyK+A0Ry4dUrkwYFkhSiDmDEJB9rAKBtX1toJRlg==`.
- **Registry-installed smoke:** `scripts/measure-first-run.mjs --subject stintwork@0.2.0 --runs 1` with empty npm and agent caches installed from registry.npmjs.org, started the server and loaded the board with the sample work item's detail open: PASS, 16.8 s install start to usable board, 3,902,895 B registry response bodies, agent cache still empty.
- **Tag and notes:** annotated tag `v0.2.0` on `33125f8`, pushed. Changelog dated 2026-11-10; release notes record the publication. CI for `33125f8`: [run 42787956629](https://github.com/tzrea1-Q/stintwork/actions/runs/42787956629).
