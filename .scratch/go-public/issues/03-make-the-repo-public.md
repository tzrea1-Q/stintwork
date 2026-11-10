# 03 — Make the repo public

Status: deferred
Blocked by: 01, 02

## What to build

After 01 and 02 merge, the maintainer confirms and changes `tzrea1-Q/stintwork` to public. The coordinator checks CI, both README renders and the bug-report and feature-idea templates on the public repo. Check that SECURITY's private reporting route is available. No agent changes visibility on the maintainer's behalf.

## Acceptance criteria

- [ ] Comments record the maintainer's confirmation and the visibility change.
- [ ] The repo and both READMEs can be read without private-repo access, and their links work.
- [ ] CI passes at the merged revision; Comments link the run and record the revision.
- [ ] Both issue templates are available on the public repo and render correctly.
- [ ] Private security reporting is available as described in SECURITY; no vulnerability is posted publicly to test it.

## Comments

**Coordinator, 2026-10-17:** This work happens in M13 · v0.2 release and going public, not M7. The repo stays private until then. The maintainer changes visibility; the coordinator records the public CI, README, issue-template and private-reporting checks here.

**Coordinator, 2026-11-10: author email.** Every existing commit's author and committer email is the maintainer's personal address, which becomes public with the repo. The maintainer decided to keep existing history unchanged and use the GitHub noreply address for future commits. The coordinator set the noreply address in this checkout's local Git config; the maintainer's global Git config and GitHub email settings are unchanged.
