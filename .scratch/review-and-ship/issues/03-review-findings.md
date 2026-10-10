# 03 — Review findings

Status: resolved
Blocked by: 01, 02

## What to build

A review stint turns into structured findings (spec user stories 1–9, 11–13). After a stint's work turn on the Review stage, a findings request runs as the second after-turn request (ticket 01). It asks for a fixed Markdown format: one block per finding with axis (Standards or Spec), severity (blocker, major, minor, nit), path, line, title and body, or an explicit "No findings". Define the format once, and keep the parser lenient about preambles, as the handoff parser is. Store the parsed findings, or the parse error with the raw reply, in the stint log with the reviewed commit. The review overlay pins each finding under its new-side line, shows findings outside the diff at the top of their file, and lists them in a rail filterable by axis, severity and status. The review brief points at the spec, the tickets, the diff range and `/code-review`, with Codex as the default reviewer.

## Acceptance criteria

- [x] Agents/core tests: parsing findings, "No findings", preambles, and a malformed reply producing a recorded error.
- [x] Server test with the fake agent: a review stint records its findings with the reviewed commit, and they appear in the snapshot.
- [x] Component tests: pinned findings, out-of-diff findings, filters, the "no findings" and parse-failure states.
- [x] Manual: a real Codex review stint produces parsed findings.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-10:** Built by Codex. verify.sh passed (804 tests; 844 after merging main with m4-05 and pol-03). Real Codex review stints in a throwaway repo: (1) claude-hello, a correct change: the brief named the spec, ticket, /code-review and the diff range; the stint finished and the after-turn request recorded findings [] with rawReply "No findings" for commit daf1d64. (2) adder, with a planted bug (add returns a - b, and the test checks only the type): two findings parsed, Spec/major add.js:2 "add subtracts instead of adding" and Spec/minor add.test.js:4 "Test does not check the required sums", ids <stint>:1 and <stint>:2, commit 9edaa90. In the review overlay both were pinned under their diff lines and listed in the findings rail with axis, severity and status filters.
