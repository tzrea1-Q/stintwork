# 06 — M7 exit

Status: ready-for-human
Blocked by: 01, 02

## What to build

Record the M7 exit result from tickets 01 and 02. Both are built and merged. Check that the maintainer confirmed the SECURITY route and support policy in 01, and the prepared links and their private-repo handling in 02. Resolve 01 and 02 after those confirmations. Set M7 shipped in the roadmap only when both are resolved. The repo stays private until M13; public-link checks, the outside-developer test and the Chinese catalog review are not conditions of this exit test.

## Acceptance criteria

- [ ] Comments record pass or fail with links to the maintainer's confirmations in 01 and 02; both tickets are resolved before a pass.
- [ ] `.stintwork/roadmap.md`: M7 is set to `shipped` only when the exit test passes; otherwise it stays active with the blockers recorded.
- [ ] M6's status follows ticket 05's review, independently of M7.
- [ ] Visibility stays private until M13. Deferred tickets 03 and 04 do not block M7.

## Comments

**Coordinator, 2026-10-17:** M7 is now Ready to go public. Its exit depends on 01 and 02, not 04. Making the repo public moves to M13; the outside-developer test and fixes follow the public release, outside v0.2.
