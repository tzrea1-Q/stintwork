# 04 — Publish v0.2

Status: ready-for-agent
Blocked by: 03

## What to build

Present the verified revision, artifact and dry-run evidence to the maintainer. Publish `stintwork@0.2.0` to npm only after the maintainer explicitly confirms this publication. The maintainer handles login or one-time authentication when needed. Follow the existing release procedure and record the release and tag against the published revision.

## Acceptance criteria

- [ ] Comments record the maintainer's explicit confirmation, final revision, artifact identity and publication result; no confirmation means no publish.
- [ ] npm serves 0.2.0 with the expected metadata and matching package integrity or shasum; a registry-installed smoke check starts the server and loads the board.
- [ ] The release tag, date, changelog and notes match the published revision and actual publication; CI evidence is linked.

## Comments
