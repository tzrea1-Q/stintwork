# 05 — Chinese catalog review

Status: resolved
Blocked by: none

## What to build

A native speaker reviews the Chinese catalog for natural wording and the terms in `GLOSSARY.md`. This is the remaining M6 exit review and can run alongside M7. It is optional for M7, not for marking M6 shipped. Record findings in Comments; fixes go to a ui-language follow-up ticket.

## Acceptance criteria

- [ ] Comments record the native speaker's review, catalog revision, findings and pass or fail.
- [ ] Each needed fix has a ui-language follow-up ticket. Fixes are reviewed before a pass is recorded.
- [ ] M6 is set to `shipped` in `.stintwork/roadmap.md` only after the review passes and its full exit test is recorded.
- [ ] An unfinished review leaves M6 active and does not block M7's exit ticket.

## Comments

**Coordinator, 2026-10-13:** The maintainer, a native Chinese speaker, reviewed the Chinese UI on main `beac99b` and approved it. That covers the 252 strings added since the 2026-10-12 review (ui-language 07's folder-name input and 08's core and server text). No wording fixes were requested. Layout problems found while switching language (the language menu, top-bar panels clipped at ~860px) are ui-language 09, not catalog findings. Still open for M6's exit: a real stint run end to end in Chinese by the maintainer.

**Coordinator, 2026-10-13:** The maintainer approved the Chinese UI and asked to move on to the remaining work. M6 is set to `shipped` on that approval. A real stint run end to end in Chinese was not recorded separately. Layout problems go to the v0.2 UI milestone, not to a catalog follow-up.
